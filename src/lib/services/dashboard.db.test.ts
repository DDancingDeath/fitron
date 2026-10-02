import { beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/domain/dates";
import { hasDb, makeGym, pick } from "@/test/db";
import { createMember } from "./members";
import { createPlan } from "./plans";
import { sellMembership } from "./billing";
import { dashboardData } from "./dashboard";
import { todayIso } from "./time";

describe.skipIf(!hasDb)("dashboard (database)", () => {
  let gym: Awaited<ReturnType<typeof makeGym>>;
  const today = todayIso();

  beforeAll(async () => {
    gym = await makeGym();
    const admin = pick(await gym.user("Super Admin"), gym.a.id);
    const plan = await createPlan(admin, { name: "Monthly", kind: "Membership", months: 1, price: 150000, regFee: 0, discount: 0, gstApplicable: false, features: [] });
    const paid = await createMember(admin, { name: "Paid Up", gender: "Female", phone: "9876511001", source: "Walk-in", tags: [] });
    const owing = await createMember(admin, { name: "Owes Money", gender: "Male", phone: "9876511002", source: "Walk-in", tags: [] });
    const lapsed = await createMember(admin, { name: "Long Gone", gender: "Male", phone: "9876511003", source: "Walk-in", tags: [] });
    // Ends in 3 days, paid by UPI today.
    await sellMembership(admin, paid.id, { planId: plan.id, startDate: addDays(today, -27), discount: 0, includeRegFee: false, payAmount: 150000, payMethod: "UPI" });
    // Active for most of a month, nothing paid.
    await sellMembership(admin, owing.id, { planId: plan.id, startDate: addDays(today, -5), discount: 0, includeRegFee: false, payAmount: 0 });
    // Expired 20 days ago.
    await sellMembership(admin, lapsed.id, { planId: plan.id, startDate: addDays(today, -50), discount: 0, includeRegFee: false, payAmount: 150000, payMethod: "Cash" });
  });

  it("computes the owner's cards the way the prototype does", async () => {
    const admin = pick(await gym.user("Super Admin"), gym.a.id);
    const d = await dashboardData(admin, "month");
    expect(d.hero).toMatchObject({ active: 2, total: 3, expired: 1, exp7: 1, exp7Value: 150000, openCount: 1, outstanding: 150000 });
    expect(d.kpis.mrr).toBe(300000);
    expect(d.expiring.map((m) => m.name)).toEqual(["Paid Up"]);
    expect(d.outstanding.map((o) => o.name)).toEqual(["Owes Money"]);
    expect(d.plans).toEqual([expect.objectContaining({ name: "Monthly", members: 2 })]);
    expect(d.series).toHaveLength(12);
    expect(d.series.at(-1)!.active).toBe(2);
  });

  it("counts every member for the accountant, and gives the front desk its own cards", async () => {
    const acct = pick(await gym.user("Accountant"), gym.a.id);
    expect((await dashboardData(acct, "month")).hero.active).toBe(2);
    const desk = await gym.user("Receptionist", [gym.a.id]);
    const d = await dashboardData(desk, "month");
    expect(d.frontDesk).toMatchObject({ checkins: 0, paymentsDue: 1 });
    expect(d.fin).toBe(false);
  });
});
