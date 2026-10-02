import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { hasDb } from "@/test/db";
import { verifyPassword } from "@/lib/auth/password";

const sent: { to: string; text: string }[] = [];
let smtp = true;
vi.mock("@/lib/integrations/email", () => ({
  emailReady: () => smtp,
  sendEmail: async (m: { to: string; text: string }) => {
    sent.push(m);
    return { sent: true };
  },
}));

const { createGymAccount, requestPasswordReset, resetPassword, verifyEmail, resendVerification } = await import("./accounts");

const linkToken = (text: string, path: string) => new URL(text.match(new RegExp(`https?://\\S+${path}\\?token=\\S+`))![0]).searchParams.get("token")!;
const signup = (email: string) => ({ plan: "starter", cycle: "YEARLY" as const, name: "Owner One", email, phone: "9876543210", business: "Iron Den", city: "Pune", password: "a-long-password" });

describe.skipIf(!hasDb)("Gym self sign-up (database)", () => {
  beforeEach(() => {
    sent.length = 0;
    smtp = true;
  });

  it("creates the gym on a trial, emails a link, and verifies once", async () => {
    const email = `${randomUUID()}@gym.test`;
    const { user, verified } = await createGymAccount(signup(email));
    expect(verified).toBe(false);
    const org = await db.organization.findUniqueOrThrow({ where: { id: user.orgId }, include: { branches: true, users: { include: { role: true } } } });
    expect(org).toMatchObject({ name: "Iron Den", plan: "starter", planCycle: "YEARLY" });
    expect(Math.round((org.trialEndsAt!.getTime() - Date.now()) / 86_400_000)).toBe(7);
    expect(org.branches.map((b) => b.name)).toEqual(["Main"]);
    expect(org.users[0]!.role.name).toBe("Super Admin");
    expect(user.emailVerifiedAt).toBeNull();

    await expect(createGymAccount(signup(email))).rejects.toThrow(/already an account/);

    expect(sent).toHaveLength(1);
    const token = linkToken(sent[0]!.text, "/verify-email");
    expect((await verifyEmail(token))?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await verifyEmail(token)).toBeNull();
    await resendVerification(email);
    expect(sent).toHaveLength(1);
  });

  it("trusts the address when no email service is set up", async () => {
    smtp = false;
    const { user, verified } = await createGymAccount(signup(`${randomUUID()}@gym.test`));
    expect(verified).toBe(true);
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(sent).toHaveLength(0);
  });

  it("refuses non-gym plans", async () => {
    await expect(createGymAccount({ ...signup(`${randomUUID()}@gym.test`), plan: "ai-pro" })).rejects.toThrow(/Gym Accounting plan/);
  });

  it("resets a password once, signs out everywhere, and ignores unknown emails", async () => {
    const email = `${randomUUID()}@gym.test`;
    const { user } = await createGymAccount(signup(email));
    await db.session.create({ data: { id: randomUUID(), userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    sent.length = 0;
    await requestPasswordReset("nobody@nowhere.test");
    expect(sent).toHaveLength(0);
    await requestPasswordReset(email);
    await requestPasswordReset(email);
    const [first, second] = sent.map((m) => linkToken(m.text, "/reset-password"));
    await expect(resetPassword(first!, "another-long-password")).rejects.toThrow(/expired or was already used/);
    await resetPassword(second!, "another-long-password");
    await expect(resetPassword(second!, "third-long-password")).rejects.toThrow(/expired/);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(after.passwordHash, "another-long-password")).toBe(true);
    expect(after.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });
});
