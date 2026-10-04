import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { writeBranch } from "@/lib/auth/current";
import { systemUser } from "@/lib/auth/system";
import type { Prisma } from "@/generated/prisma/client";
import { addDays } from "@/lib/domain/dates";
import { invoiceTotals } from "@/lib/domain/billing";
import { rupeesText } from "@/lib/domain/whatsapp";
import { createPlan, createSubscription, razorpayReady, subscriptionAction } from "@/lib/integrations/razorpay";
import { audit } from "./audit";
import { sellMembership, suggestedStart } from "./billing";
import { UserError } from "./errors";
import { memberScope } from "./members";
import { nextNumber } from "./sequence";
import { notify } from "./notifications";
import { getSetting } from "./settings";
import { getTax } from "./tax";
import { fromIso, toIso, todayIso } from "./time";
import { sendTemplate } from "./whatsapp";

export type AutopayMode = "demo" | "live";
export const getAutopayMode = async (orgId: string): Promise<AutopayMode> => ((await getSetting<{ mode?: AutopayMode }>(orgId, "autopay"))?.mode === "live" ? "live" : "demo");

const scope = (u: CurrentUser): Prisma.AutopayMandateWhereInput => ({ orgId: u.orgId, branchId: { in: u.branchIds } });

export async function listMandates(u: CurrentUser, status?: string) {
  const rows = await db.autopayMandate.findMany({
    where: { ...scope(u), ...(status ? { status } : {}) },
    orderBy: [{ status: "asc" }, { nextDebitOn: "asc" }],
    include: { member: { select: { id: true, code: true, name: true, phone: true } } },
  });
  const plans = new Map((await db.membershipPlan.findMany({ where: { orgId: u.orgId }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  return rows.map((r) => ({ ...r, planName: plans.get(r.planId) ?? "—" }));
}

export const getMandate = (u: CurrentUser, id: string) => db.autopayMandate.findFirst({ where: { ...scope(u), id }, include: { member: true, events: { orderBy: { createdAt: "desc" }, take: 30 } } });

/** Plan price after its standard discount, with GST: what each autopay cycle debits. */
async function cycleAmount(orgId: string, plan: { price: number; discount: number; gstApplicable: boolean }) {
  const tax = await getTax(orgId);
  return invoiceTotals([{ qty: 1, rate: plan.price, discount: plan.discount, taxRate: tax.enabled && plan.gstApplicable ? tax.rate : 0 }]).total;
}

/**
 * Sets up autopay for a member on a plan. Live mode creates the Razorpay plan and subscription
 * and sends the approval link on WhatsApp; demo mode waits for "Approve (demo)".
 */
/** A UPI ID: name@handle. */
export const VPA = /^[\w.-]{2,}@[a-z][a-z0-9]{1,}$/i;

export async function createMandate(u: CurrentUser, a: { memberId: string; planId: string; startOn?: string; vpa?: string }) {
  const vpa = a.vpa?.trim().toLowerCase() || null;
  if (vpa && !VPA.test(vpa)) throw new UserError("Enter a UPI ID like name@okicici.", "vpa");
  const member = await db.member.findFirst({ where: { ...memberScope(u), id: a.memberId, walkIn: false } });
  if (!member) throw new UserError("Member not found.", "member");
  const plan = await db.membershipPlan.findFirst({ where: { orgId: u.orgId, id: a.planId, status: "ACTIVE" } });
  if (!plan) throw new UserError("Pick an active plan.", "planId");
  const open = await db.autopayMandate.findFirst({ where: { memberId: member.id, status: { in: ["Pending", "Active", "Paused"] } } });
  if (open) throw new UserError(`${member.name} already has autopay (${open.code}). Cancel it first.`);
  const mode = await getAutopayMode(u.orgId);
  if (mode === "live" && razorpayReady()) throw new UserError(`Autopay is set to live but ${razorpayReady()}`);
  const amount = await cycleAmount(u.orgId, plan);
  const startOn = a.startOn ?? (await suggestedStart(member.id)).start;
  const branchId = member.branchId ?? writeBranch(u);

  const mandate = await db.$transaction(async (tx) => {
    const n = await nextNumber(tx, u.orgId, "mandate", 1001);
    const m = await tx.autopayMandate.create({ data: { code: `MD-${n}`, orgId: u.orgId, branchId, memberId: member.id, planId: plan.id, amount, months: plan.months, mode, vpa, nextDebitOn: fromIso(startOn), createdById: u.id } });
    await audit(tx, { orgId: u.orgId, userId: u.id, action: "autopay.create", entity: "AutopayMandate", entityId: m.id, after: m });
    return m;
  });

  if (mode === "live") {
    try {
      const plans = (await getSetting<Record<string, string>>(u.orgId, "autopay_plans")) ?? {};
      const key = `${amount}|${plan.months}`;
      let rzpPlan = plans[key];
      if (!rzpPlan) {
        rzpPlan = await createPlan(amount, plan.months, `${plan.name} (${plan.months} month${plan.months > 1 ? "s" : ""})`);
        const value = { ...plans, [key]: rzpPlan };
        await db.setting.upsert({ where: { orgId_key: { orgId: u.orgId, key: "autopay_plans" } }, create: { orgId: u.orgId, key: "autopay_plans", value }, update: { value } });
      }
      const sub = await createSubscription({ planId: rzpPlan, startAt: fromIso(startOn), notes: { fitron_mandate: mandate.id, member: member.code } });
      await db.autopayMandate.update({ where: { id: mandate.id }, data: { subscriptionId: sub.id, shortUrl: sub.short_url ?? null } });
      mandate.shortUrl = sub.short_url ?? null;
    } catch (e) {
      await db.autopayMandate.update({ where: { id: mandate.id }, data: { status: "Failed", lastResult: `Razorpay: ${e instanceof Error ? e.message : String(e)}` } });
      throw new UserError(`Razorpay refused the mandate: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await sendTemplate({ orgId: u.orgId, memberId: member.id, key: "mandate", userId: u.id, auto: true, vars: { plan_name: plan.name, amount: rupeesText(amount), link: mandate.shortUrl ?? "(demo mode, no real link)" } }).catch(() => null);
  return mandate;
}

async function update(tx: Prisma.TransactionClient, orgId: string, userId: string | null, id: string, data: Prisma.AutopayMandateUpdateInput, action: string) {
  const before = await tx.autopayMandate.findUniqueOrThrow({ where: { id } });
  const after = await tx.autopayMandate.update({ where: { id }, data });
  await audit(tx, { orgId, userId, action, entity: "AutopayMandate", entityId: id, before, after });
  return after;
}

/** Pause, resume or cancel. Live mandates are changed at Razorpay first. */
export async function changeMandate(u: CurrentUser, id: string, action: "pause" | "resume" | "cancel" | "approve-demo") {
  const m = await db.autopayMandate.findFirst({ where: { ...scope(u), id } });
  if (!m) throw new UserError("Mandate not found.");
  const allowed: Record<typeof action, string[]> = { pause: ["Active"], resume: ["Paused", "Halted", "Failed"], cancel: ["Pending", "Active", "Paused", "Halted", "Failed"], "approve-demo": ["Pending"] };
  if (!allowed[action].includes(m.status)) throw new UserError(`Can't ${action.replace("-demo", "")} a mandate that is ${m.status.toLowerCase()}.`);
  if (action === "approve-demo" && m.mode !== "demo") throw new UserError("Live mandates are approved by the member in their UPI app.");
  if (m.mode === "live" && m.subscriptionId && action !== "approve-demo") {
    try {
      await subscriptionAction(m.subscriptionId, action);
    } catch (e) {
      throw new UserError(`Razorpay: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const status = { pause: "Paused", resume: "Active", cancel: "Cancelled", "approve-demo": "Active" }[action];
  await db.$transaction((tx) => update(tx, u.orgId, u.id, id, { status, retries: action === "resume" ? 0 : undefined, lastResult: action === "approve-demo" ? "Approved (demo)" : undefined }, `autopay.${action}`));
}

/**
 * A successful debit: renews the membership with an AUTOPAY invoice and records the payment.
 * Idempotent on the provider's payment id, so a repeated webhook or job does nothing.
 */
export async function recordCharge(mandateId: string, charge: { paymentId: string; amount: number }) {
  const m = await db.autopayMandate.findUniqueOrThrow({ where: { id: mandateId } });
  if (await db.payment.findFirst({ where: { orgId: m.orgId, txnRef: charge.paymentId } })) return "duplicate";
  const sys = await systemUser(m.orgId, m.createdById);
  const plan = await db.membershipPlan.findFirst({ where: { id: m.planId, orgId: m.orgId } });
  if (!plan || plan.status !== "ACTIVE") {
    await db.$transaction(async (tx) => {
      await update(tx, m.orgId, null, m.id, { lastResult: `Charged ₹${rupeesText(charge.amount)} but the plan is no longer active. Renew by hand.` }, "autopay.charge_unapplied");
      await notify(tx, { orgId: m.orgId, branchId: m.branchId, type: "AUTOPAY", text: `Autopay ${m.code} was charged but its plan is inactive. Renew the member by hand.`, link: `/autopay/${m.id}` });
    });
    return "plan-inactive";
  }
  const { start } = await suggestedStart(m.memberId);
  const total = await cycleAmount(m.orgId, plan);
  const r = await sellMembership(sys, m.memberId, { planId: plan.id, startDate: start, discount: plan.discount, includeRegFee: false, payAmount: Math.min(charge.amount, total), payMethod: "UPI", payRef: charge.paymentId }, { type: "AUTOPAY" });
  const next = addDays(toIso(r.membership.endDate), 1);
  await db.$transaction((tx) => update(tx, m.orgId, null, m.id, { status: "Active", retries: 0, nextDebitOn: fromIso(next), lastResult: `Charged ₹${rupeesText(charge.amount)} on ${todayIso()} (${r.invoice.number})` }, "autopay.charged"));
  await sendTemplate({ orgId: m.orgId, memberId: m.memberId, key: "renewal", auto: true, invoiceId: r.invoice.id, vars: { invoice_number: r.invoice.number, amount: rupeesText(r.invoice.total) } }).catch(() => null);
  return "renewed";
}

type RzpEvent = {
  event: string;
  payload?: {
    subscription?: { entity?: { id?: string; status?: string; charge_at?: number | null; notes?: Record<string, string> } };
    payment?: { entity?: { id?: string; amount?: number; status?: string; error_description?: string | null; notes?: Record<string, string>; subscription_id?: string } };
  };
};

/** Applies one verified Razorpay webhook. Replays of the same event id are ignored. */
export async function applyRazorpayEvent(eventId: string, ev: RzpEvent) {
  if (await db.autopayEvent.findUnique({ where: { eventId } })) return "duplicate";
  const sub = ev.payload?.subscription?.entity;
  const pay = ev.payload?.payment?.entity;
  const ref = sub?.notes?.fitron_mandate ?? pay?.notes?.fitron_mandate;
  const sid = sub?.id ?? pay?.subscription_id;
  const m = (ref && (await db.autopayMandate.findUnique({ where: { id: ref } }))) || (sid && (await db.autopayMandate.findUnique({ where: { subscriptionId: sid } }))) || null;
  const logged = await db.autopayEvent.create({ data: { eventId, mandateId: m?.id ?? null, type: ev.event, payload: ev as Prisma.InputJsonValue } });
  if (!m) {
    await db.autopayEvent.update({ where: { id: logged.id }, data: { result: "No matching mandate" } });
    return "unknown-mandate";
  }
  const chargeAt = sub?.charge_at ? toIso(new Date(sub.charge_at * 1000 + 330 * 60_000)) : null;
  const set = (data: Prisma.AutopayMandateUpdateInput, alert?: string) =>
    db.$transaction(async (tx) => {
      await update(tx, m.orgId, null, m.id, data, `autopay.${ev.event}`);
      if (alert) await notify(tx, { orgId: m.orgId, branchId: m.branchId, type: "AUTOPAY", text: alert, link: `/autopay/${m.id}` });
    });
  let result: string;
  switch (ev.event) {
    case "subscription.authenticated":
    case "subscription.activated":
    case "subscription.resumed":
      await set({ status: "Active", ...(chargeAt ? { nextDebitOn: fromIso(chargeAt) } : {}), lastResult: ev.event === "subscription.resumed" ? "Resumed" : "Approved by member" });
      result = "active";
      break;
    case "subscription.charged":
      result = pay?.id && pay.amount ? await recordCharge(m.id, { paymentId: pay.id, amount: pay.amount }) : "no-payment";
      if (chargeAt) await db.autopayMandate.update({ where: { id: m.id }, data: { nextDebitOn: fromIso(chargeAt) } });
      break;
    case "subscription.pending":
    case "payment.failed":
      await set({ status: "Failed", retries: { increment: 1 }, lastResult: pay?.error_description ?? "Debit failed; Razorpay will retry" }, `Autopay ${m.code} debit failed: ${pay?.error_description ?? "Razorpay will retry"}`);
      result = "failed";
      break;
    case "subscription.halted":
      await set({ status: "Halted", lastResult: "Retries exhausted. Collect by hand." }, `Autopay ${m.code} stopped after failed retries. Collect the renewal at the desk.`);
      result = "halted";
      break;
    case "subscription.paused":
      await set({ status: "Paused", lastResult: "Paused" });
      result = "paused";
      break;
    case "subscription.cancelled":
    case "subscription.completed":
      await set({ status: "Cancelled", lastResult: ev.event === "subscription.completed" ? "All cycles done" : "Cancelled" });
      result = "cancelled";
      break;
    default:
      result = "ignored";
  }
  await db.autopayEvent.update({ where: { id: logged.id }, data: { result } });
  return result;
}

/**
 * Daily, in demo mode: the debit itself on the renewal date. Live debits come from Razorpay
 * webhooks. The debit notice a day ahead is the "Autopay debit notice" template's rule (reminders.autopay).
 */
export async function runAutopayDay(orgId: string, today = todayIso()) {
  const due = await db.autopayMandate.findMany({ where: { orgId, mode: "demo", status: "Active", nextDebitOn: { lte: fromIso(today) } } });
  let charged = 0;
  for (const m of due) {
    const r = await recordCharge(m.id, { paymentId: `demo_${m.code}_${today}`, amount: m.amount });
    if (r === "renewed") charged++;
  }
  return { charged };
}

/** The Autopay screen's numbers (prototype KPIs): debits due in a week, collected in 30 days, debits per mandate. */
export async function autopayStats(u: CurrentUser, mandates: { id: string; memberId: string; createdAt: Date }[], today = todayIso()) {
  const [collected, charges] = await Promise.all([
    db.payment.aggregate({
      where: { orgId: u.orgId, branchId: { in: u.branchIds }, status: "SUCCESS", date: { gte: fromIso(addDays(today, -30)) }, invoice: { membership: { type: "AUTOPAY" } } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.membership.findMany({ where: { memberId: { in: mandates.map((m) => m.memberId) }, type: "AUTOPAY" }, select: { memberId: true, createdAt: true } }),
  ]);
  const debits = new Map(mandates.map((m) => [m.id, charges.filter((c) => c.memberId === m.memberId && c.createdAt >= m.createdAt).length]));
  return { collected: collected._sum.amount ?? 0, collectedCount: collected._count._all, debits };
}

/** "Retry now" on a failed or halted demo mandate: runs the debit again straight away. */
export async function retryDemoDebit(u: CurrentUser, id: string) {
  const m = await db.autopayMandate.findFirst({ where: { ...scope(u), id } });
  if (!m) throw new UserError("Mandate not found.");
  if (m.mode !== "demo") throw new UserError("Razorpay retries live debits itself.");
  if (!["Failed", "Halted"].includes(m.status)) throw new UserError("Only a failed debit can be retried.");
  return recordCharge(m.id, { paymentId: `demo_${m.code}_${todayIso()}_retry${m.retries}`, amount: m.amount });
}
