import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hasDb, makeGym, pick } from "@/test/db";
import { createMember } from "./members";
import { createPlan } from "./plans";
import { cancelInvoice, collectPayment, createInvoice, getInvoice, listReceivables, reversePayment, sellMembership, suggestedStart } from "./billing";
import { UserError } from "./errors";
import { todayIso } from "./time";
import { addDays, membershipEndDate } from "@/lib/domain/dates";

describe.skipIf(!hasDb)("billing (database)", () => {
  let gym: Awaited<ReturnType<typeof makeGym>>;
  let admin: Awaited<ReturnType<Awaited<ReturnType<typeof makeGym>>["user"]>>;
  let planId: string;
  let phone = 9811100000;
  const newMember = async () => createMember(admin, { name: "Test Member", gender: "Male", phone: String(phone++), source: "Walk-in", tags: [] });
  const today = todayIso();

  beforeAll(async () => {
    gym = await makeGym();
    admin = pick(await gym.user("Super Admin"), gym.a.id);
    // ₹4,000 plan + ₹500 registration, 18% GST
    planId = (await createPlan(admin, { name: "Quarterly", kind: "Membership", months: 3, price: 400000, regFee: 50000, discount: 0, gstApplicable: true, features: [] })).id;
  });

  const sale = (over = {}) => ({ planId, startDate: today, discount: 0, includeRegFee: true, payAmount: 0, ...over });

  it("sells a new membership with GST, part payment, and computed status", async () => {
    const m = await newMember();
    const r = await sellMembership(admin, m.id, sale({ payAmount: 200000, payMethod: "UPI" as const }));
    expect(r.invoice.total).toBe(531000); // (4000 + 500) × 1.18
    expect(r.membership.type).toBe("NEW");
    expect(r.membership.endDate.toISOString().slice(0, 10)).toBe(membershipEndDate(today, 3));
    const inv = await getInvoice(admin, r.invoice.id);
    expect(inv).toMatchObject({ status: "PARTIALLY_PAID", paid: 200000, balance: 331000 });
  });

  it("collects the balance and becomes PAID; refuses overpayment", async () => {
    const m = await newMember();
    const { invoice } = await sellMembership(admin, m.id, sale({ payAmount: 100000, payMethod: "Cash" as const }));
    await expect(collectPayment(admin, invoice.id, { amount: 999999, method: "UPI", date: today })).rejects.toThrow(UserError);
    await collectPayment(admin, invoice.id, { amount: invoice.total - 100000, method: "UPI", date: today });
    expect((await getInvoice(admin, invoice.id))?.status).toBe("PAID");
  });

  it("renews from the day after the current membership ends, without a registration fee by default", async () => {
    const m = await newMember();
    const first = await sellMembership(admin, m.id, sale());
    const { start, isNew } = await suggestedStart(m.id);
    expect(isNew).toBe(false);
    expect(start).toBe(addDays(first.membership.endDate.toISOString().slice(0, 10), 1));
    const renewal = await sellMembership(admin, m.id, sale({ startDate: start, includeRegFee: false }));
    expect(renewal.membership.type).toBe("RENEWAL");
    expect(renewal.invoice.total).toBe(472000);
  });

  it("cancelling an invoice reverses its payments and cancels the membership", async () => {
    const m = await newMember();
    const { invoice, membership } = await sellMembership(admin, m.id, sale({ payAmount: 531000, payMethod: "UPI" as const }));
    await cancelInvoice(admin, invoice.id, "Sold by mistake");
    const inv = await getInvoice(admin, invoice.id);
    expect(inv).toMatchObject({ status: "CANCELLED", balance: 0 });
    expect(inv?.payments.every((p) => p.status === "REVERSED")).toBe(true);
    expect((await db.membership.findUnique({ where: { id: membership.id } }))?.status).toBe("CANCELLED");
  });

  it("reversing a payment puts the balance back", async () => {
    const m = await newMember();
    const { invoice, payment } = await sellMembership(admin, m.id, sale({ payAmount: 531000, payMethod: "UPI" as const }));
    await reversePayment(admin, payment!.id, "Bounced");
    expect(await getInvoice(admin, invoice.id)).toMatchObject({ status: "UNPAID", balance: 531000 });
    await expect(reversePayment(admin, payment!.id, "Again")).rejects.toThrow(/already reversed/);
  });

  it("blocks writes in a locked month for an Accountant but not a Super Admin", async () => {
    const m = await newMember();
    const { invoice } = await sellMembership(admin, m.id, sale());
    const month = today.slice(0, 7);
    await db.monthLock.create({ data: { branchId: gym.a.id, month, lockedById: admin.id, lockedAt: new Date() } });
    const accountant = pick(await gym.user("Accountant"), gym.a.id);
    await expect(collectPayment(accountant, invoice.id, { amount: 1000, method: "Cash", date: today })).rejects.toThrow(/locked/);
    await collectPayment(admin, invoice.id, { amount: 1000, method: "Cash", date: today });
    await db.monthLock.delete({ where: { branchId_month: { branchId: gym.a.id, month } } });
  });

  it("creates standalone invoices and lists receivables", async () => {
    const m = await newMember();
    const inv = await createInvoice(admin, {
      memberId: m.id,
      date: today,
      dueDate: today,
      lines: [{ description: "PT sessions", category: "Personal Training", qty: 4, rate: 50000, discount: 0, taxable: true }],
      payAmount: 0,
    });
    expect(inv.total).toBe(236000);
    const { list } = await listReceivables(admin, "unpaid");
    expect(list.some((r) => r.id === inv.id)).toBe(true);
  });

  it("numbers invoices without gaps", async () => {
    const m = await newMember();
    const a = await sellMembership(admin, m.id, sale());
    const b = await sellMembership(admin, m.id, sale({ includeRegFee: false }));
    expect(Number(b.invoice.number.split("-")[1])).toBe(Number(a.invoice.number.split("-")[1]) + 1);
  });
});
