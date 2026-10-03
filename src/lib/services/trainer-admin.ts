import "server-only";
import { db } from "@/lib/db";
import { findPlan } from "@/lib/domain/pricing";
import { addDays } from "@/lib/domain/dates";
import { trainerPeriod } from "@/lib/domain/trainer";
import type { Cycle } from "@/lib/domain/pricing";
import { sendEmail } from "@/lib/integrations/email";
import { UserError } from "./errors";
import { trainerPaymentRef } from "./trainer";
import { fromIso, toIso, todayIso } from "./time";

// For the FITRON team page (fitron-admin): AI Trainer members' UPI payments waiting for a check.
// Same shape of work as gym payments in saas.ts (paymentsToCheck / reviewPayment).

const label = (plan: string, cycle: string) => `${findPlan(plan)?.name ?? plan}, ${cycle === "YEARLY" ? "yearly" : "monthly"}`;

/** AI Trainer UPI payments with a UTR to check (oldest first), and the 20 most recently checked. */
export async function trainerPaymentsToCheck() {
  const include = { member: { select: { email: true, name: true } } } as const;
  const [waiting, recent] = await Promise.all([
    db.trainerPayment.findMany({ where: { status: "SUBMITTED" }, orderBy: { submittedAt: "asc" }, take: 200, include }),
    db.trainerPayment.findMany({ where: { reviewedAt: { not: null } }, orderBy: { reviewedAt: "desc" }, take: 20, include }),
  ]);
  const row = (p: (typeof waiting)[number]) => ({
    id: p.id,
    ref: trainerPaymentRef(p.id),
    member: p.member.name || p.member.email,
    email: p.member.email,
    what: label(p.plan, p.cycle),
    plan: p.plan,
    cycle: p.cycle,
    total: p.total,
    utr: p.utr,
    /** DEMO = made while FITRON_UPI_ID wasn't set; no real money was asked for */
    mode: p.mode,
    status: p.status,
    submittedAt: p.submittedAt,
    reviewedBy: p.reviewedBy,
    reviewedAt: p.reviewedAt,
    rejectReason: p.rejectReason,
    periodEnd: p.periodEnd ? toIso(p.periodEnd) : null,
  });
  return { waiting: waiting.map(row), recent: recent.map(row) };
}

/**
 * The FITRON team found the UTR in the bank statement (CONFIRM) or didn't (REJECT, with a reason).
 * Confirming activates the member's plan for one period after what they already have.
 */
export async function reviewTrainerPayment(reviewer: { email: string }, id: string, decision: "CONFIRM" | "REJECT", reason = "") {
  const p = await db.trainerPayment.findFirst({ where: { id, status: { in: ["SUBMITTED", "REJECTED"] } }, include: { member: true } });
  if (!p) throw new UserError("This payment isn't waiting for a check.");
  const amount = `Rs ${(p.total / 100).toFixed(2)}`;
  if (decision === "REJECT") {
    if (!reason.trim()) throw new UserError("Say why, so the member knows what to fix.");
    // Only while it's still waiting: never over a payment someone else just confirmed.
    const rejected = await db.trainerPayment.updateMany({ where: { id, status: { in: ["SUBMITTED", "REJECTED"] } }, data: { status: "REJECTED", reviewedBy: reviewer.email, reviewedAt: new Date(), rejectReason: reason.trim().slice(0, 200) } });
    if (!rejected.count) throw new UserError("This payment was just confirmed by someone else.");
    await sendEmail({
      to: p.member.email,
      subject: "We couldn't confirm your FITRON payment",
      text: `Hi ${p.member.name || "there"},\n\nWe couldn't match your UPI payment of ${amount} (UTR ${p.utr}): ${reason.trim()}.\nCheck the UTR in your UPI app and pay again from the app, or reply to this email.\n\nFITRON\nhello@fitron.in`,
    }).catch((e) => console.error("Trainer payment email failed", e));
    return null;
  }
  const today = todayIso();
  const done = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TrainerPayment" WHERE id = ${id} FOR UPDATE`;
    const fresh = await tx.trainerPayment.findUniqueOrThrow({ where: { id }, include: { member: true } });
    if (fresh.status === "PAID") return fresh;
    const m = fresh.member;
    const trialLast = m.trialEndsAt ? addDays(todayIso(m.trialEndsAt), -1) : null;
    const period = trainerPeriod(fresh.cycle as Cycle, today, m.paidUntil ? toIso(m.paidUntil) : null, trialLast);
    // A move to AI Pro waits until the AI Premium time already paid for runs out (currentTrainer then
    // switches it); a move up to AI Premium starts at once.
    const paidPremiumLeft = m.plan === "ai-premium" && !!m.paidUntil && toIso(m.paidUntil) >= today;
    const plan = fresh.plan === "ai-pro" && paidPremiumLeft ? m.plan : fresh.plan;
    await tx.trainerMember.update({ where: { id: m.id }, data: { plan, cycle: fresh.cycle, paidUntil: fromIso(period.end), planCancelled: false } });
    return tx.trainerPayment.update({
      where: { id },
      data: { status: "PAID", paidAt: new Date(), periodStart: fromIso(period.start), periodEnd: fromIso(period.end), reviewedBy: reviewer.email, reviewedAt: new Date(), rejectReason: null },
      include: { member: true },
    });
  });
  await sendEmail({
    to: p.member.email,
    subject: "Your FITRON plan is active",
    text: `Hi ${p.member.name || "there"},\n\nWe received your UPI payment of ${amount} (UTR ${p.utr}). Your ${label(done.plan, done.cycle)} plan is active until ${done.periodEnd ? toIso(done.periodEnd) : ""}.\n\nFITRON\nhello@fitron.in`,
  }).catch((e) => console.error("Trainer payment email failed", e));
  return done;
}
