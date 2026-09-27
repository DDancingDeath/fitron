import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { addDays, addMonths } from "@/lib/domain/dates";
import { audit } from "./audit";
import { UserError } from "./errors";
import { getSetting } from "./settings";
import { fromIso, todayIso } from "./time";
import { depreciationIn, disposalsIn } from "@/lib/domain/assets";
import { assetsFor, toLike } from "./assets";

export type Period = { from: string; to: string };

export const monthPeriod = (ym: string): Period => ({ from: `${ym}-01`, to: addDays(addMonths(`${ym}-01`, 1), -1) });

/**
 * Rule 11: P&L comes from invoice items and expenses, never stored totals.
 * Revenue is the net of each line (after discount, before GST) on non-cancelled invoices dated in the period.
 * Rule 12: capital spend stays out; depreciation and disposal gains or losses come from the asset register.
 */
export async function profitAndLoss(u: CurrentUser, p: Period) {
  const [items, expenses, payments, assets] = await Promise.all([
    db.invoiceItem.findMany({
      where: { invoice: { orgId: u.orgId, branchId: { in: u.branchIds }, status: "ISSUED", date: { gte: fromIso(p.from), lte: fromIso(p.to) } } },
      select: { category: true, amount: true, taxAmount: true },
    }),
    db.expense.findMany({
      where: { orgId: u.orgId, branchId: { in: u.branchIds }, status: "ACTIVE", capital: false, date: { gte: fromIso(p.from), lte: fromIso(p.to) } },
      select: { amount: true, category: { select: { name: true, group: true } } },
    }),
    db.payment.findMany({
      where: { orgId: u.orgId, branchId: { in: u.branchIds }, status: "SUCCESS", date: { gte: fromIso(p.from), lte: fromIso(p.to) } },
      select: { amount: true, method: true },
    }),
    assetsFor(u.orgId, u.branchIds),
  ]);
  const sumBy = <T>(xs: T[], key: (x: T) => string, val: (x: T) => number) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + val(x));
    return [...m.entries()].map(([k, v]) => ({ key: k, amount: v })).sort((a, b) => b.amount - a.amount);
  };
  const revenue = sumBy(items, (i) => i.category, (i) => i.amount);
  const expenseGroups = sumBy(expenses, (e) => e.category.group, (e) => e.amount);
  const expenseCats = sumBy(expenses, (e) => e.category.name, (e) => e.amount);
  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenseGroups.reduce((s, r) => s + r.amount, 0);
  const gstCollected = items.reduce((s, i) => s + i.taxAmount, 0);
  const collected = payments.reduce((s, x) => s + x.amount, 0);
  const like = assets.map(toLike);
  const depreciation = depreciationIn(like, p.from.slice(0, 7), p.to.slice(0, 7));
  const disposals = disposalsIn(like, p.from, p.to);
  return {
    revenue,
    expenseGroups,
    expenseCats,
    totalRevenue,
    totalExpenses,
    depreciation,
    disposalGain: disposals.gain,
    disposalLoss: disposals.loss,
    net: totalRevenue + disposals.gain - totalExpenses - depreciation - disposals.loss,
    gstCollected,
    collected,
    collectedByMethod: sumBy(payments, (x) => x.method, (x) => x.amount),
  };
}

/**
 * Money in and out per payment method, the cash book view. In: member payments and asset sale proceeds.
 * Out: expenses (capital ones included), except those on supplier bills, where the supplier payments are the cash that moved.
 */
export async function ledger(u: CurrentUser, method: string, p: Period) {
  const rows = await movements(u, method, p);
  // The cash and bank books start from the balances entered when the gym switched to Fitron.
  const opening = method === "Cash" || method === "Bank Transfer" ? await getSetting<{ cash?: number; bank?: number; asOf?: string }>(u.orgId, "opening") : null;
  let bal = 0;
  let broughtForward: number | null = null;
  if (opening?.asOf && opening.asOf <= p.to) {
    const amount = (method === "Cash" ? opening.cash : opening.bank) ?? 0;
    if (opening.asOf < p.from) {
      const before = await movements(u, method, { from: opening.asOf, to: addDays(p.from, -1) });
      broughtForward = amount + before.reduce((s, r) => s + r.in - r.out, 0);
      bal = broughtForward;
    } else {
      rows.push({ date: fromIso(opening.asOf), ref: "OPENING", text: "Opening balance", link: null, in: Math.max(amount, 0), out: Math.max(-amount, 0) });
      rows.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.ref === "OPENING" ? -1 : b.ref === "OPENING" ? 1 : a.ref.localeCompare(b.ref)));
    }
  }
  const withBal = rows.map((r) => ((bal += r.in - r.out), { ...r, balance: bal }));
  const moves = rows.filter((r) => r.ref !== "OPENING");
  return { rows: withBal, broughtForward, closing: bal, totalIn: moves.reduce((s, r) => s + r.in, 0), totalOut: moves.reduce((s, r) => s + r.out, 0) };
}

async function movements(u: CurrentUser, method: string, p: Period) {
  const range = { gte: fromIso(p.from), lte: fromIso(p.to) };
  const [payments, expenses, vendorPays, sales] = await Promise.all([
    db.payment.findMany({
      where: { orgId: u.orgId, branchId: { in: u.branchIds }, status: "SUCCESS", method, date: { gte: fromIso(p.from), lte: fromIso(p.to) } },
      include: { member: { select: { name: true } }, invoice: { select: { number: true, id: true } } },
    }),
    db.expense.findMany({
      where: { orgId: u.orgId, branchId: { in: u.branchIds }, status: "ACTIVE", purchaseId: null, method, date: range },
      include: { category: { select: { name: true } } },
    }),
    db.vendorPayment.findMany({
      where: { method, date: range, purchase: { orgId: u.orgId, branchId: { in: u.branchIds }, status: "ACTIVE" } },
      include: { purchase: { select: { id: true, code: true, vendor: true } } },
    }),
    db.asset.findMany({
      where: { orgId: u.orgId, branchId: { in: u.branchIds }, deletedAt: null, status: "SOLD", disposeMethod: method, disposedOn: range, disposedFor: { gt: 0 } },
    }),
  ]);
  return [
    ...payments.map((x) => ({ date: x.date, ref: x.code, text: `${x.member.name} · ${x.invoice.number}`, link: `/invoices/${x.invoice.id}`, in: x.amount, out: 0 })),
    ...expenses.map((x) => ({ date: x.date, ref: x.code, text: `${x.category.name} · ${x.description}`, link: (x.assetId ? `/assets/${x.assetId}` : null) as string | null, in: 0, out: x.amount })),
    ...vendorPays.map((x) => ({ date: x.date, ref: x.code, text: `${x.purchase.vendor} · ${x.purchase.code}`, link: `/purchases/${x.purchase.id}` as string | null, in: 0, out: x.amount })),
    ...sales.map((x) => ({ date: x.disposedOn!, ref: x.code, text: `Sale of ${x.name}`, link: `/assets/${x.id}` as string | null, in: x.disposedFor!, out: 0 })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || a.ref.localeCompare(b.ref));
}

/** Last 12 months with P&L headline and lock state for the picked branch(es). */
export async function monthOverview(u: CurrentUser, months = 12) {
  const now = todayIso().slice(0, 7);
  const list: string[] = [];
  for (let i = 0; i < months; i++) list.push(addMonths(`${now}-01`, -i).slice(0, 7));
  const locks = await db.monthLock.findMany({ where: { branchId: { in: u.branchIds }, month: { in: list } } });
  const out = [];
  for (const ym of list) {
    const pl = await profitAndLoss(u, monthPeriod(ym));
    const locked = u.branchIds.filter((b) => locks.some((l) => l.branchId === b && l.month === ym));
    out.push({ month: ym, revenue: pl.totalRevenue, expenses: pl.totalExpenses + pl.depreciation + pl.disposalLoss, net: pl.net, collected: pl.collected, lockedBranches: locked.length, branches: u.branchIds.length });
  }
  return out;
}

export async function lockMonth(u: CurrentUser, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new UserError("Bad month.");
  if (month >= todayIso().slice(0, 7)) throw new UserError("You can only lock a month that has ended.");
  await db.$transaction(async (tx) => {
    for (const branchId of u.branchIds) {
      const exists = await tx.monthLock.findUnique({ where: { branchId_month: { branchId, month } } });
      if (exists) continue;
      const lock = await tx.monthLock.create({ data: { branchId, month, lockedById: u.id, lockedAt: new Date() } });
      await audit(tx, { orgId: u.orgId, userId: u.id, action: "month.lock", entity: "MonthLock", entityId: `${branchId}:${month}`, after: lock });
    }
  });
}

export async function unlockMonth(u: CurrentUser, month: string) {
  await db.$transaction(async (tx) => {
    for (const branchId of u.branchIds) {
      const before = await tx.monthLock.findUnique({ where: { branchId_month: { branchId, month } } });
      if (!before) continue;
      await tx.monthLock.delete({ where: { branchId_month: { branchId, month } } });
      await audit(tx, { orgId: u.orgId, userId: u.id, action: "month.unlock", entity: "MonthLock", entityId: `${branchId}:${month}`, before });
    }
  });
}

export async function listAudit(u: CurrentUser, f: { q?: string; userId?: string; entity?: string; page?: number }) {
  const pageSize = 50;
  const page = Math.max(1, f.page ?? 1);
  const where = {
    orgId: u.orgId,
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.entity ? { entity: f.entity } : {}),
    ...(f.q ? { OR: [{ action: { contains: f.q, mode: "insensitive" as const } }, { entityId: { contains: f.q } }] } : {}),
  };
  const [rows, total, users] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.auditLog.count({ where }),
    db.user.findMany({ where: { orgId: u.orgId }, select: { id: true, name: true } }),
  ]);
  const names = new Map(users.map((x) => [x.id, x.name]));
  return { rows: rows.map((r) => ({ ...r, id: String(r.id), userName: r.userId ? (names.get(r.userId) ?? "Unknown") : "System" })), total, page, pageSize, users };
}
