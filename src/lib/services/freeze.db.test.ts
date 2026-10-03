import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addDays } from "@/lib/domain/dates";
import { hasDb, makeGym, pick } from "@/test/db";
import { createMember, summarize } from "./members";
import { createPlan } from "./plans";
import { sellMembership } from "./billing";
import { checkIn } from "./attendance";
import { freezeMembership, openFreeze, transferMember, unfreezeMembership } from "./freeze";
import { todayIso } from "./time";

describe.skipIf(!hasDb)("freeze and transfer (database)", () => {
  it("moves the end date, blocks check-in while frozen, and gives unused days back", async () => {
    const gym = await makeGym();
    const admin = pick(await gym.user("Super Admin"), gym.a.id);
    const today = todayIso();
    const plan = await createPlan(admin, { name: "Monthly", kind: "Membership", months: 1, price: 150000, regFee: 0, discount: 0, gstApplicable: false, features: [] });
    const m = await createMember(admin, { name: "Goes Away", gender: "Female", phone: "9876555001", source: "Walk-in", tags: [] });
    await sellMembership(admin, m.id, { planId: plan.id, startDate: addDays(today, -5), discount: 0, includeRegFee: false, payAmount: 150000, payMethod: "Cash" });
    const end = (await summarize([m.id])).get(m.id)!.latestEnd!;

    await expect(freezeMembership(admin, m.id, { days: 120, from: today, reason: "Travel" })).rejects.toThrow(/1 to 90/);
    const r = await freezeMembership(admin, m.id, { days: 10, from: today, reason: "Travel" });
    expect(r.newEnd).toBe(addDays(end, 10));
    await expect(freezeMembership(admin, m.id, { days: 5, from: today, reason: "Travel" })).rejects.toThrow(/Already frozen/);
    expect(await checkIn(admin, m.id)).toMatchObject({ ok: false, blocked: expect.stringMatching(/frozen/) });

    expect(await unfreezeMembership(admin, m.id)).toEqual({ returned: 10, newEnd: end });
    expect(await openFreeze(m.id)).toBeNull();
    expect((await checkIn(admin, m.id)).ok).toBe(true);
    expect((await db.auditLog.findMany({ where: { orgId: gym.org.id, action: { in: ["membership.freeze", "membership.unfreeze"] } } })).length).toBe(2);
  });

  it("transfers a member to another of the user's branches", async () => {
    const gym = await makeGym();
    const admin = pick(await gym.user("Super Admin"), gym.a.id);
    const m = await createMember(admin, { name: "Moves House", gender: "Male", phone: "9876555002", source: "Walk-in", tags: [] });
    await expect(transferMember(admin, m.id, gym.a.id)).rejects.toThrow(/different branch/);
    await transferMember(admin, m.id, gym.b.id, "Moved house");
    expect((await db.member.findUniqueOrThrow({ where: { id: m.id } })).branchId).toBe(gym.b.id);
  });
});
