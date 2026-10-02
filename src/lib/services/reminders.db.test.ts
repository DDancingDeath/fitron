import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays, daysBetween } from "@/lib/domain/dates";
import { hasDb, makeGym, pick } from "@/test/db";
import { createMember, summarize } from "./members";
import { createPlan } from "./plans";
import { sellMembership } from "./billing";
import { expiryKey, lastRenewalReminders, remindAllOverdue, remindDue, remindRenewal, renewalAmounts } from "./reminders";
import { todayIso } from "./time";

describe.skipIf(!hasDb)("reminders (database)", () => {
  let gym: Awaited<ReturnType<typeof makeGym>>;
  let owing: string;
  let ending: string;

  beforeAll(async () => {
    gym = await makeGym();
    const admin = pick(await gym.user("Super Admin"), gym.a.id);
    const today = todayIso();
    const plan = await createPlan(admin, { name: "Monthly", kind: "Membership", months: 1, price: 150000, regFee: 0, discount: 0, gstApplicable: false, features: [] });
    owing = (await createMember(admin, { name: "Owes", gender: "Male", phone: "9876522001", source: "Walk-in", tags: [] })).id;
    ending = (await createMember(admin, { name: "Ends Soon", gender: "Female", phone: "9876522002", source: "Walk-in", tags: [] })).id;
    const sale = await sellMembership(admin, owing, { planId: plan.id, startDate: addDays(today, -20), discount: 0, includeRegFee: false, payAmount: 0 });
    // Make the unpaid invoice overdue.
    await db.invoice.update({ where: { id: sale.invoice.id }, data: { dueDate: new Date(`${addDays(today, -10)}T00:00:00Z`) } });
    await sellMembership(admin, ending, { planId: plan.id, startDate: addDays(today, -28), discount: 10000, includeRegFee: false, payAmount: 140000, payMethod: "UPI" });
  });

  it("picks the expiry template by days left", () => {
    expect([expiryKey(7), expiryKey(5), expiryKey(3), expiryKey(1), expiryKey(0), expiryKey(-4)]).toEqual(["exp7", "exp7", "exp3", "exp1", "expired", "expired"]);
  });

  it("sends a due reminder once, then skips repeats within the window", async () => {
    const desk = await gym.user("Receptionist", [gym.a.id]);
    expect(await remindDue(desk, owing)).toBe(true);
    expect(await remindDue(desk, owing)).toBe(false);
    expect(await remindAllOverdue(desk)).toEqual({ sent: 0, skipped: 1 });
  });

  it("sends the right renewal reminder and reports it as the last one", async () => {
    const desk = await gym.user("Receptionist", [gym.a.id]);
    expect(await remindRenewal(desk, ending)).toBe(true);
    const last = (await lastRenewalReminders([ending])).get(ending);
    const end = (await summarize([ending])).get(ending)!.latestEnd!;
    expect(last?.templateKey).toBe(expiryKey(daysBetween(end, todayIso())));
    expect((await renewalAmounts([ending])).get(ending)).toBe(140000);
  });
});
