import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hasDb, makeGym, pick } from "@/test/db";
import { addDays } from "@/lib/domain/dates";
import { createMember } from "./members";
import { createPlan } from "./plans";
import { cancelInvoice, getInvoice, sellMembership } from "./billing";
import { checkIn, listDay } from "./attendance";
import { book, saveSlot, setBookingStatus, weekdayOf } from "./classes";
import { adjustStock, posSale, saveProduct } from "./pos";
import { createLead, getLead, setLeadStage } from "./leads";
import { listNotifications } from "./notifications";
import { todayIso } from "./time";

describe.skipIf(!hasDb)("front desk (database)", () => {
  let gym: Awaited<ReturnType<typeof makeGym>>;
  let admin: Awaited<ReturnType<Awaited<ReturnType<typeof makeGym>>["user"]>>;
  let planId: string;
  let phone = 9833300000;
  const today = todayIso();
  const newMember = async () => createMember(admin, { name: `Member ${phone}`, gender: "Female", phone: String(phone++), source: "Walk-in", tags: [] });

  beforeAll(async () => {
    gym = await makeGym();
    admin = pick(await gym.user("Super Admin"), gym.a.id);
    planId = (await createPlan(admin, { name: "Monthly", kind: "Membership", months: 1, price: 150000, regFee: 0, discount: 0, gstApplicable: true, features: [] })).id;
  });

  it("class booking fills to capacity, then waitlists, and promotes on cancel", async () => {
    const date = addDays(today, 7);
    const slot = await saveSlot(admin, null, { name: "HIIT", trainerId: admin.id, weekday: weekdayOf(date), startTime: "06:30", durationMin: 45, capacity: 2 });
    const [a, b, c] = [await newMember(), await newMember(), await newMember()];
    expect((await book(admin, slot.id, date, a.id)).status).toBe("Booked");
    const bb = await book(admin, slot.id, date, b.id);
    expect(bb.status).toBe("Booked");
    expect((await book(admin, slot.id, date, c.id)).status).toBe("Waitlist");
    await expect(book(admin, slot.id, date, a.id)).rejects.toThrow(/already booked/);
    await expect(book(admin, slot.id, addDays(date, 1), a.id)).rejects.toThrow(/doesn't run/);

    const { promoted } = await setBookingStatus(admin, bb.id, "Cancelled");
    expect(promoted).toBe(c.name);
    const statuses = await db.booking.findMany({ where: { classSlotId: slot.id }, select: { memberId: true, status: true } });
    expect(statuses.find((s) => s.memberId === c.id)?.status).toBe("Booked");
    expect((await listNotifications(admin)).some((n) => n.type === "WAITLIST")).toBe(true);
    await expect(setBookingStatus(admin, bb.id, "Attended")).rejects.toThrow(/day of the class/);
  });

  it("POS sale decrements stock, refuses to oversell, and cancelling puts it back", async () => {
    const p = await saveProduct(admin, null, { sku: "WHEY", name: "Whey 2 kg", category: "Supplements", price: 420000, cost: 330000, trackStock: true, reorderLevel: 2, gstApplicable: true });
    await adjustStock(admin, p.id, { qty: 4, unitCost: 330000 });
    const inv = await posSale(admin, { method: "UPI", items: [{ productId: p.id, qty: 2 }] });
    expect(inv.total).toBe(991200); // 2 × 4,200 × 1.18
    expect(await getInvoice(admin, inv.id)).toMatchObject({ status: "PAID" });
    expect((await db.product.findUnique({ where: { id: p.id } }))?.stock).toBe(2);
    expect((await listNotifications(admin)).some((n) => n.type === "LOW_STOCK")).toBe(true);
    await expect(posSale(admin, { method: "Cash", items: [{ productId: p.id, qty: 3 }] })).rejects.toThrow(/Only 2/);
    // The walk-in customer is created once and never shows as a member.
    const walkIns = await db.member.findMany({ where: { orgId: gym.org.id, walkIn: true } });
    expect(walkIns).toHaveLength(1);
    await cancelInvoice(admin, inv.id, "Returned sealed");
    expect((await db.product.findUnique({ where: { id: p.id } }))?.stock).toBe(4);
  });

  it("restocking at a new cost moves the product cost to the weighted average", async () => {
    const p = await saveProduct(admin, null, { sku: "BAR", name: "Protein bar", category: "Drinks", price: 12000, cost: 7000, trackStock: true, reorderLevel: undefined, gstApplicable: true });
    await adjustStock(admin, p.id, { qty: 10, unitCost: 7000 });
    await adjustStock(admin, p.id, { qty: 10, unitCost: 9000 });
    expect((await db.product.findUnique({ where: { id: p.id } }))?.cost).toBe(8000);
    await expect(adjustStock(admin, p.id, { qty: -25 })).rejects.toThrow(/Only 20/);
  });

  it("check-in follows the entry rules, and staff can override with a reason", async () => {
    const active = await newMember();
    await sellMembership(admin, active.id, { planId, startDate: today, discount: 0, includeRegFee: false, payAmount: 0 });
    expect(await checkIn(admin, active.id)).toMatchObject({ ok: true });
    await expect(checkIn(admin, active.id)).rejects.toThrow(/already inside/);

    const never = await newMember();
    expect(await checkIn(admin, never.id)).toMatchObject({ ok: false, blocked: "No membership yet" });
    expect(await checkIn(admin, never.id, { override: "Paying at the desk" })).toMatchObject({ ok: true });
    const day = await listDay(admin, today);
    expect(day.rows.find((r) => r.memberId === never.id)?.override).toMatch(/No membership yet: Paying/);
    expect((await listNotifications(admin)).some((n) => n.type === "CHECKIN_OVERRIDE")).toBe(true);
  });

  it("a lead moves through stages and is won when converted to a member", async () => {
    const lead = await createLead(admin, { name: "Asha Lead", phone: "9844400001", source: "Instagram", interest: "Monthly", ownerId: admin.id });
    await expect(createLead(admin, { name: "Dup", phone: "9844400001", source: "Instagram", interest: "Monthly", ownerId: admin.id })).rejects.toThrow(/already an open lead/);
    await setLeadStage(admin, lead.id, "Trial booked");
    expect((await getLead(admin, lead.id))?.trialOn).not.toBeNull();
    await expect(setLeadStage(admin, lead.id, "Lost")).rejects.toThrow(/why/);
    const m = await createMember(admin, { name: "Asha Lead", gender: "Female", phone: "9844400001", source: "Instagram", tags: [] }, { leadId: lead.id });
    expect(await getLead(admin, lead.id)).toMatchObject({ stage: "Won", memberId: m.id });
  });
});
