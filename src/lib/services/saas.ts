import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import type { Prisma } from "@/generated/prisma/client";
import { daysBetween } from "@/lib/domain/dates";
import { branchPrice, INCLUDED_BRANCHES, nextPeriod, standings, type Cycle, type Standing } from "@/lib/domain/saas";
import { createOrder, fitronKeyId, verifyCheckout } from "@/lib/integrations/razorpay";
import { audit } from "./audit";
import { UserError } from "./errors";
import { notify } from "./notifications";
import { getSetting } from "./settings";
import { fromIso, toIso, todayIso } from "./time";

type Tx = Prisma.TransactionClient | typeof db;

/** Who Fitron is on its own tax invoices. */
export const fitronSeller = () => ({
  name: process.env.FITRON_LEGAL_NAME?.trim() || "Fitron Technologies",
  gstin: process.env.FITRON_GSTIN?.trim() || "",
  address: process.env.FITRON_ADDRESS?.trim() || "",
});

async function paidUntil(tx: Tx, orgId: string) {
  const subs = await tx.branchSubscription.findMany({ where: { orgId, status: "PAID", branchId: { not: null } }, select: { branchId: true, periodEnd: true } });
  const out = new Map<string, string>();
  for (const s of subs) {
    const end = toIso(s.periodEnd!);
    if ((out.get(s.branchId!) ?? "") < end) out.set(s.branchId!, end);
  }
  return out;
}

/** Every branch of the gym with where it stands on the plan, oldest first. */
export async function branchStandings(orgId: string, today = todayIso(), tx: Tx = db) {
  const branches = await tx.branch.findMany({ where: { orgId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, gstin: true } });
  const paid = await paidUntil(tx, orgId);
  const s = standings(branches, paid, today);
  const freeSlots = await tx.branchSubscription.findMany({ where: { orgId, status: "PAID", branchId: null, periodEnd: { gte: fromIso(today) } }, orderBy: { periodEnd: "asc" } });
  return { branches: branches.map((b) => ({ ...b, standing: s.get(b.id)! })), freeSlots };
}

export const READ_ONLY_MESSAGE = "This branch is read-only because its extra-branch plan has lapsed. Its records are safe; a Super Admin can renew it in Settings › Plan & billing.";

/** No new members or invoices in a branch whose paid period and grace have both run out. */
export async function assertBranchWritable(tx: Tx, orgId: string, branchId: string) {
  const count = await tx.branch.count({ where: { orgId } });
  if (count <= INCLUDED_BRANCHES) return;
  const { branches } = await branchStandings(orgId, todayIso(), tx);
  if (branches.find((b) => b.id === branchId)?.standing.kind === "READ_ONLY") throw new UserError(READ_ONLY_MESSAGE);
}

/** A new branch beyond the 3 included takes a paid, unused slot. Call inside the transaction that creates it. */
export async function claimSlot(tx: Prisma.TransactionClient, orgId: string, branchId: string) {
  const existing = await tx.branch.count({ where: { orgId, id: { not: branchId } } });
  if (existing < INCLUDED_BRANCHES) return;
  const slot = await tx.branchSubscription.findFirst({ where: { orgId, status: "PAID", branchId: null, periodEnd: { gte: fromIso(todayIso()) } }, orderBy: { periodEnd: "asc" } });
  const claimed = slot ? await tx.branchSubscription.updateMany({ where: { id: slot.id, branchId: null }, data: { branchId } }) : { count: 0 };
  if (!claimed.count) throw new UserError(`Your plan includes ${INCLUDED_BRANCHES} branches. Pay for an extra branch in Settings › Plan & billing, then add it here.`);
}

export async function billingHistory(u: CurrentUser) {
  return db.branchSubscription.findMany({ where: { orgId: u.orgId, status: "PAID" }, orderBy: { paidAt: "desc" }, take: 50 });
}

export type Checkout =
  | { mode: "DEMO"; id: string; total: number }
  | { mode: "LIVE"; id: string; total: number; keyId: string; orderId: string; name: string; description: string; prefill: { name: string; email: string } };

/** Starts paying for an extra branch: a new slot (no branchId) or another period for an existing branch. */
export async function startBranchPayment(u: CurrentUser, cycle: Cycle, branchId: string | null): Promise<Checkout> {
  if (branchId) {
    const { branches } = await branchStandings(u.orgId);
    const b = branches.find((x) => x.id === branchId);
    if (!b) throw new UserError("Branch not found.");
    if (b.standing.kind === "INCLUDED") throw new UserError("This branch is included in your plan.");
  }
  const price = branchPrice(cycle);
  const keyId = fitronKeyId();
  const sub = await db.branchSubscription.create({ data: { orgId: u.orgId, branchId, cycle, ...price, mode: keyId ? "LIVE" : "DEMO", createdById: u.id } });
  if (!keyId) return { mode: "DEMO", id: sub.id, total: price.total };
  const description = `${branchId ? "Renew extra branch" : "Extra branch"} · ${cycle === "YEARLY" ? "1 year" : "1 month"} (incl. 18% GST)`;
  const order = await createOrder({ amount: price.total, receipt: sub.id, notes: { subscription: sub.id, org: u.orgId, cycle } });
  await db.branchSubscription.update({ where: { id: sub.id }, data: { razorpayOrderId: order.id } });
  const seller = fitronSeller();
  return { mode: "LIVE", id: sub.id, total: price.total, keyId, orderId: order.id, name: seller.name, description, prefill: { name: u.name, email: u.email } };
}

async function invoiceNumber(tx: Prisma.TransactionClient, today: string) {
  const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('fitron_invoice_seq') AS n`;
  const y = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0);
  return `FIT/${y}-${String(y + 1).slice(2)}/${String(n).padStart(5, "0")}`;
}

/** Marks a payment done, once: sets the paid period, gives it a Fitron invoice number, and audits it. */
async function complete(where: { id: string } | { razorpayOrderId: string }, paymentId: string | null) {
  const today = todayIso();
  return db.$transaction(async (tx) => {
    const sub = await tx.branchSubscription.findFirst({ where });
    if (!sub) return null;
    await tx.$queryRaw`SELECT id FROM "BranchSubscription" WHERE id = ${sub.id} FOR UPDATE`;
    const fresh = await tx.branchSubscription.findUniqueOrThrow({ where: { id: sub.id } });
    if (fresh.status === "PAID") return fresh;
    const last = fresh.branchId ? ((await paidUntil(tx, fresh.orgId)).get(fresh.branchId) ?? null) : null;
    const p = nextPeriod(fresh.cycle as Cycle, today, last);
    const after = await tx.branchSubscription.update({
      where: { id: fresh.id },
      data: { status: "PAID", paidAt: new Date(), periodStart: fromIso(p.start), periodEnd: fromIso(p.end), razorpayPaymentId: paymentId, invoiceNo: await invoiceNumber(tx, today) },
    });
    await audit(tx, { orgId: fresh.orgId, userId: fresh.createdById, action: "billing.branch-paid", entity: "BranchSubscription", entityId: fresh.id, before: fresh, after });
    return after;
  });
}

/** Demo mode only (Fitron's Razorpay keys not set): the payment is simulated. */
export async function confirmDemoPayment(u: CurrentUser, id: string) {
  const sub = await db.branchSubscription.findFirst({ where: { id, orgId: u.orgId } });
  if (!sub || sub.mode !== "DEMO") throw new UserError("Payment not found.");
  return complete({ id }, null);
}

/** Checkout reported success; trust it only if Razorpay's signature checks out. The webhook confirms it too. */
export async function confirmCheckout(u: CurrentUser, a: { orderId: string; paymentId: string; signature: string }) {
  const sub = await db.branchSubscription.findFirst({ where: { razorpayOrderId: a.orderId, orgId: u.orgId } });
  if (!sub) throw new UserError("Payment not found.");
  if (!verifyCheckout(a.orderId, a.paymentId, a.signature)) throw new UserError("Razorpay couldn't confirm this payment. If money left your account, it will show here once Razorpay tells us.");
  return complete({ id: sub.id }, a.paymentId);
}

type RzpEvent = { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } } };

/** Fitron's Razorpay account → payment.captured marks the extra branch paid (idempotent). */
export async function applyFitronBillingEvent(ev: RzpEvent) {
  const pay = ev.payload?.payment?.entity;
  if (ev.event === "payment.captured" && pay?.order_id && pay.id) {
    const done = await complete({ razorpayOrderId: pay.order_id }, pay.id);
    return done ? "paid" : "unknown order";
  }
  if (ev.event === "payment.failed" && pay?.order_id) {
    await db.branchSubscription.updateMany({ where: { razorpayOrderId: pay.order_id, status: "PENDING" }, data: { status: "FAILED" } });
    return "failed";
  }
  return "ignored";
}

export async function getBillingInvoice(u: CurrentUser, id: string) {
  const sub = await db.branchSubscription.findFirst({ where: { id, orgId: u.orgId, status: "PAID" } });
  if (!sub) return null;
  const [branch, gym, anyGstin] = await Promise.all([
    sub.branchId ? db.branch.findUnique({ where: { id: sub.branchId } }) : null,
    getSetting<{ name?: string }>(u.orgId, "gym"),
    db.branch.findFirst({ where: { orgId: u.orgId, gstin: { not: null } }, orderBy: { createdAt: "asc" } }),
  ]);
  const buyer = branch?.gstin ? branch : anyGstin;
  return { sub, branch, buyer: { name: gym?.name ?? u.orgName, gstin: buyer?.gstin ?? null, address: buyer?.address ?? branch?.address ?? "" }, seller: fitronSeller() };
}

/** Daily: warn the owner before an extra branch's period ends, during grace, and when it turns read-only. */
export async function billingReminders(orgId: string, today: string) {
  const { branches } = await branchStandings(orgId, today);
  let sent = 0;
  for (const b of branches) {
    const s: Standing = b.standing;
    let text = "";
    if (s.kind === "PAID" && [7, 3, 1].includes(daysBetween(s.until, today))) text = `${b.name}'s extra-branch plan ends on ${s.until}. Renew to keep it running.`;
    if (s.kind === "GRACE") text = `${b.name}'s extra-branch plan has ended. It becomes read-only on ${s.readOnlyFrom} unless renewed.`;
    if (s.kind === "READ_ONLY" && s.since === today) text = `${b.name} is now read-only: no new members or invoices until its extra-branch plan is renewed.`;
    if (!text) continue;
    await db.$transaction((tx) => notify(tx, { orgId, branchId: b.id, type: "BILLING", text, link: "/settings/billing" }));
    sent++;
  }
  return { sent };
}
