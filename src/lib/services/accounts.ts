import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { findPlan, TRIAL_DAYS, type Cycle } from "@/lib/domain/pricing";
import { emailReady, sendEmail } from "@/lib/integrations/email";
import { ensureExpenseCategories, ensureRoles } from "../../../prisma/roles";
import { isUniqueViolation, UserError } from "./errors";

// Self sign-up for gyms, email verification and password reset.

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const HOUR = 3_600_000;
const LIFETIME = { VERIFY_EMAIL: 48 * HOUR, RESET_PASSWORD: 1 * HOUR } as const;
type Purpose = keyof typeof LIFETIME;

export const appUrl = () => (process.env.APP_URL?.trim() || (process.env.NODE_ENV === "production" ? "https://fitron.in" : "http://localhost:3000")).replace(/\/$/, "");

/** Makes a one-time link token; only its hash is stored. Older unused tokens of the same kind stop working. */
async function issueToken(userId: string, purpose: Purpose) {
  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.authToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } }),
    db.authToken.create({ data: { id: sha256(token), userId, purpose, expiresAt: new Date(Date.now() + LIFETIME[purpose]) } }),
  ]);
  return token;
}

/** Marks the token used and returns its user id, or null if it is unknown, used or expired. */
async function redeemToken(token: string, purpose: Purpose) {
  const row = await db.authToken.findUnique({ where: { id: sha256(token) } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;
  const { count } = await db.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return count === 1 ? row.userId : null;
}

export type GymSignup = { plan: string; cycle: Cycle; name: string; email: string; phone: string; business: string; city?: string; password: string };

/**
 * Creates a gym on a free trial: the organisation, its first branch, default roles and
 * categories, and the owner as Super Admin. Then emails the owner a verification link.
 * Without an email service there is no way to deliver the link, so the address is trusted.
 */
/** `emailVerified`: Google has already confirmed the address, so no link is sent. */
export async function createGymAccount(d: GymSignup, emailVerified = false) {
  const plan = findPlan(d.plan);
  if (!plan || plan.product !== "GYM_ACCOUNTING") throw new UserError("Pick a Gym Accounting plan.", "plan");
  if (await db.user.findUnique({ where: { email: d.email } })) {
    throw new UserError("There's already an account with this email. Log in, or reset your password.", "email");
  }
  const roles = await ensureRoles(db);
  await ensureExpenseCategories(db);
  const passwordHash = await hashPassword(d.password);
  const verifyNow = emailVerified || !emailReady();
  let user;
  try {
    user = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: d.business, plan: plan.key, planCycle: d.cycle, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * HOUR) },
      });
      const branch = await tx.branch.create({ data: { orgId: org.id, name: "Main", address: d.city ?? "", phone: d.phone } });
      await tx.setting.create({ data: { orgId: org.id, key: "gym", value: { name: d.business } } });
      return tx.user.create({
        data: {
          orgId: org.id,
          name: d.name,
          email: d.email,
          phone: d.phone,
          roleId: roles.get("Super Admin")!,
          passwordHash,
          emailVerifiedAt: verifyNow ? new Date() : null,
          branches: { create: [{ branchId: branch.id }] },
        },
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError("There's already an account with this email. Log in, or reset your password.", "email");
    throw e;
  }
  if (!verifyNow) await sendVerification(user.id);
  return { user, verified: verifyNow };
}

export async function sendVerification(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return;
  const link = `${appUrl()}/verify-email?token=${await issueToken(user.id, "VERIFY_EMAIL")}`;
  await sendEmail({
    to: user.email,
    subject: "Confirm your email for FITRON",
    text: `Hi ${user.name},\n\nConfirm your email to start using FITRON:\n${link}\n\nThe link works for 48 hours. If you didn't sign up, ignore this email.\n\nFITRON\nhello@fitron.in`,
  });
}

/** Resends the link to an unverified address. Says nothing about whether the address exists. */
export async function resendVerification(email: string) {
  const user = await db.user.findFirst({ where: { email, active: true, deletedAt: null, emailVerifiedAt: null } });
  if (user) await sendVerification(user.id);
}

export async function verifyEmail(token: string) {
  const userId = await redeemToken(token, "VERIFY_EMAIL");
  if (!userId) return null;
  return db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
}

/** Emails a reset link if the address belongs to an active account. Always looks the same to the caller. */
export async function requestPasswordReset(email: string) {
  const user = await db.user.findFirst({ where: { email, active: true, deletedAt: null } });
  if (!user) return;
  const link = `${appUrl()}/reset-password?token=${await issueToken(user.id, "RESET_PASSWORD")}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your FITRON password",
    text: `Hi ${user.name},\n\nChoose a new password here:\n${link}\n\nThe link works for 1 hour. If you didn't ask for this, ignore this email: your password stays the same.\n\nFITRON\nhello@fitron.in`,
  });
}

/**
 * Sets a new password from a reset link and signs the user out everywhere. Clicking a link
 * from their inbox also proves the address, so it counts as verified.
 */
export async function resetPassword(token: string, password: string) {
  const userId = await redeemToken(token, "RESET_PASSWORD");
  if (!userId) throw new UserError("This link has expired or was already used. Ask for a new one.");
  const passwordHash = await hashPassword(password);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() } }),
    db.session.deleteMany({ where: { userId } }),
  ]);
  return user;
}
