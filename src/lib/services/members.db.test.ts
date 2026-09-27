import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hasDb, makeGym, pick } from "@/test/db";
import { createMember, deleteMember, getMember, listMembers, updateMember } from "./members";
import { createPlan, deletePlan } from "./plans";
import { UserError } from "./errors";
import type { MemberInput } from "@/lib/validation/member";

const input = (over: Partial<MemberInput> = {}): MemberInput => ({
  name: "Priya Sharma",
  gender: "Female",
  phone: "9876500001",
  source: "Walk-in",
  tags: [],
  ...over,
});

describe.skipIf(!hasDb)("members (database)", () => {
  let gym: Awaited<ReturnType<typeof makeGym>>;
  beforeAll(async () => {
    gym = await makeGym();
  });

  it("numbers members without gaps and audits the create", async () => {
    const admin = pick(await gym.user("Super Admin"), gym.a.id);
    const m1 = await createMember(admin, input({ phone: "9876500011" }));
    const m2 = await createMember(admin, input({ phone: "9876500012" }));
    expect(Number(m2.code.split("-")[1])).toBe(Number(m1.code.split("-")[1]) + 1);
    const log = await db.auditLog.findFirst({ where: { entity: "Member", entityId: m1.id } });
    expect(log).toMatchObject({ action: "member.create", userId: admin.id });
  });

  it("rejects a duplicate phone among active members, and allows it after a delete", async () => {
    const admin = pick(await gym.user("Super Admin"), gym.a.id);
    const m = await createMember(admin, input({ phone: "9876500021" }));
    await expect(createMember(admin, input({ phone: "9876500021" }))).rejects.toThrow(UserError);
    await deleteMember(admin, m.id);
    const again = await createMember(admin, input({ phone: "9876500021", name: "New Owner" }));
    expect(again.name).toBe("New Owner");
    expect(await getMember(admin, m.id)).toBeNull();
  });

  it("won't let an edit take another member's phone", async () => {
    const admin = pick(await gym.user("Super Admin"), gym.a.id);
    await createMember(admin, input({ phone: "9876500031" }));
    const other = await createMember(admin, input({ phone: "9876500032" }));
    await expect(updateMember(admin, other.id, input({ phone: "9876500031" }))).rejects.toThrow(/already belongs/);
  });

  it("keeps branches apart", async () => {
    const admin = await gym.user("Super Admin");
    const inB = await createMember(pick(admin, gym.b.id), input({ phone: "9876500041" }));
    const frontDeskA = await gym.user("Receptionist", [gym.a.id]);
    expect(await getMember(frontDeskA, inB.id)).toBeNull();
    expect((await listMembers(frontDeskA, { all: true })).rows.some((r) => r.id === inB.id)).toBe(false);
  });

  it("shows trainers only their assigned members", async () => {
    const admin = pick(await gym.user("Super Admin"), gym.a.id);
    const trainer = await gym.user("Trainer", [gym.a.id]);
    const mine = await createMember(admin, input({ phone: "9876500051", trainerId: trainer.id }));
    const notMine = await createMember(admin, input({ phone: "9876500052" }));
    const seen = (await listMembers(trainer, { all: true })).rows.map((r) => r.id);
    expect(seen).toContain(mine.id);
    expect(seen).not.toContain(notMine.id);
  });

  it("treats a member with no membership as expired", async () => {
    const admin = pick(await gym.user("Super Admin"), gym.a.id);
    const m = await createMember(admin, input({ phone: "9876500061" }));
    expect((await getMember(admin, m.id))?.status).toBe("EXPIRED");
  });

  it("lets unsold plans be deleted", async () => {
    const admin = await gym.user("Super Admin");
    const p = await createPlan(admin, { name: "Trial", kind: "Membership", months: 1, price: 100, regFee: 0, discount: 0, gstApplicable: true, features: [] });
    await deletePlan(admin, p.id);
    expect(await db.membershipPlan.findUnique({ where: { id: p.id } })).toBeNull();
  });
});
