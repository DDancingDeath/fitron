import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import type { Permission } from "@/lib/auth/permissions";
import { daysBetween } from "@/lib/domain/dates";
import { listMembers } from "./members";
import { listReceivables } from "./billing";
import { fromIso, toIso, todayIso } from "./time";
import type { Period } from "./accounting";

export type Cell = string | number | null;
export type Column = { key: string; label: string; money?: boolean };
export type Report = { columns: Column[]; rows: Record<string, Cell>[]; totals?: Record<string, Cell> };

type Def = { title: string; group: string; perm: Permission; usesPeriod: boolean; run: (u: CurrentUser, p: Period) => Promise<Report> };

const inPeriod = (p: Period) => ({ gte: fromIso(p.from), lte: fromIso(p.to) });
const sumCol = (rows: Record<string, Cell>[], k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const branchScope = (u: CurrentUser) => ({ orgId: u.orgId, branchId: { in: u.branchIds } });

export const REPORTS: Record<string, Def> = {
  collections: {
    title: "Collections",
    group: "Billing",
    perm: "invoices.view",
    usesPeriod: true,
    async run(u, p) {
      const pays = await db.payment.findMany({
        where: { ...branchScope(u), status: "SUCCESS", date: inPeriod(p) },
        orderBy: [{ date: "asc" }, { code: "asc" }],
        include: { member: { select: { name: true, code: true } }, invoice: { select: { number: true } } },
      });
      const rows = pays.map((x) => ({ date: toIso(x.date), payment: x.code, invoice: x.invoice.number, member: `${x.member.name} (${x.member.code})`, method: x.method, ref: x.txnRef, amount: x.amount }));
      return {
        columns: [{ key: "date", label: "Date" }, { key: "payment", label: "Payment" }, { key: "invoice", label: "Invoice" }, { key: "member", label: "Member" }, { key: "method", label: "Method" }, { key: "ref", label: "Reference" }, { key: "amount", label: "Amount", money: true }],
        rows,
        totals: { amount: sumCol(rows, "amount") },
      };
    },
  },
  "revenue-category": {
    title: "Revenue by category",
    group: "Billing",
    perm: "accounting.view",
    usesPeriod: true,
    async run(u, p) {
      const items = await db.invoiceItem.findMany({ where: { invoice: { ...branchScope(u), status: "ISSUED", date: inPeriod(p) } }, select: { category: true, amount: true, taxAmount: true } });
      const m = new Map<string, { n: number; net: number; tax: number }>();
      for (const i of items) {
        const r = m.get(i.category) ?? { n: 0, net: 0, tax: 0 };
        r.n++;
        r.net += i.amount;
        r.tax += i.taxAmount;
        m.set(i.category, r);
      }
      const rows = [...m.entries()].map(([category, r]) => ({ category, lines: r.n, net: r.net, gst: r.tax, gross: r.net + r.tax })).sort((a, b) => b.net - a.net);
      return {
        columns: [{ key: "category", label: "Category" }, { key: "lines", label: "Lines" }, { key: "net", label: "Net", money: true }, { key: "gst", label: "GST", money: true }, { key: "gross", label: "Gross", money: true }],
        rows,
        totals: { net: sumCol(rows, "net"), gst: sumCol(rows, "gst"), gross: sumCol(rows, "gross") },
      };
    },
  },
  "revenue-plan": {
    title: "Sales by plan",
    group: "Billing",
    perm: "accounting.view",
    usesPeriod: true,
    async run(u, p) {
      const ms = await db.membership.findMany({
        where: { branchId: { in: u.branchIds }, status: "VALID", invoice: { status: "ISSUED", date: inPeriod(p) } },
        include: { plan: { select: { name: true } } },
      });
      const m = new Map<string, { n: number; renewals: number; amount: number }>();
      for (const x of ms) {
        const r = m.get(x.plan.name) ?? { n: 0, renewals: 0, amount: 0 };
        r.n++;
        if (x.type === "RENEWAL") r.renewals++;
        r.amount += x.price - x.discount;
        m.set(x.plan.name, r);
      }
      const rows = [...m.entries()].map(([plan, r]) => ({ plan, sold: r.n, renewals: r.renewals, amount: r.amount })).sort((a, b) => b.amount - a.amount);
      return { columns: [{ key: "plan", label: "Plan" }, { key: "sold", label: "Sold" }, { key: "renewals", label: "Of which renewals" }, { key: "amount", label: "Net amount", money: true }], rows, totals: { sold: sumCol(rows, "sold"), amount: sumCol(rows, "amount") } };
    },
  },
  gst: {
    title: "GST summary",
    group: "Accounts",
    perm: "accounting.view",
    usesPeriod: true,
    async run(u, p) {
      const invs = await db.invoice.findMany({ where: { ...branchScope(u), status: "ISSUED", date: inPeriod(p) }, orderBy: [{ date: "asc" }, { number: "asc" }], include: { member: { select: { name: true } } } });
      const rows = invs.map((i) => {
        const cgst = i.gstType === "CGST+SGST" ? Math.floor(i.tax / 2) : 0;
        return { date: toIso(i.date), invoice: i.number, member: i.member.name, taxable: i.subtotal - i.discount, cgst, sgst: i.gstType === "CGST+SGST" ? i.tax - cgst : 0, igst: i.gstType === "IGST" ? i.tax : 0, total: i.total };
      });
      return {
        columns: [{ key: "date", label: "Date" }, { key: "invoice", label: "Invoice" }, { key: "member", label: "Member" }, { key: "taxable", label: "Taxable value", money: true }, { key: "cgst", label: "CGST", money: true }, { key: "sgst", label: "SGST", money: true }, { key: "igst", label: "IGST", money: true }, { key: "total", label: "Invoice total", money: true }],
        rows,
        totals: Object.fromEntries(["taxable", "cgst", "sgst", "igst", "total"].map((k) => [k, sumCol(rows, k)])),
      };
    },
  },
  expenses: {
    title: "Expenses",
    group: "Accounts",
    perm: "accounting.view",
    usesPeriod: true,
    async run(u, p) {
      const ex = await db.expense.findMany({ where: { ...branchScope(u), status: "ACTIVE", date: inPeriod(p) }, orderBy: [{ date: "asc" }], include: { category: true } });
      const rows = ex.map((e) => ({ date: toIso(e.date), code: e.code, category: e.category.name, group: e.category.group, description: e.description, vendor: e.vendor, method: e.method, bill: e.billNo, amount: e.amount }));
      return {
        columns: [{ key: "date", label: "Date" }, { key: "code", label: "No." }, { key: "category", label: "Category" }, { key: "group", label: "Group" }, { key: "description", label: "Description" }, { key: "vendor", label: "Vendor" }, { key: "method", label: "Paid by" }, { key: "bill", label: "Bill no." }, { key: "amount", label: "Amount", money: true }],
        rows,
        totals: { amount: sumCol(rows, "amount") },
      };
    },
  },
  dues: {
    title: "Outstanding dues",
    group: "Billing",
    perm: "invoices.view",
    usesPeriod: false,
    async run(u) {
      const { list } = await listReceivables(u);
      const rows = list.map((r) => ({ invoice: r.number, date: toIso(r.date), due: toIso(r.dueDate), member: r.member.name, phone: r.member.phone, total: r.total, paid: r.paid, balance: r.balance, overdue: r.overdueDays }));
      return {
        columns: [{ key: "invoice", label: "Invoice" }, { key: "date", label: "Date" }, { key: "due", label: "Due" }, { key: "member", label: "Member" }, { key: "phone", label: "Phone" }, { key: "total", label: "Total", money: true }, { key: "paid", label: "Paid", money: true }, { key: "balance", label: "Balance", money: true }, { key: "overdue", label: "Days overdue" }],
        rows,
        totals: { total: sumCol(rows, "total"), paid: sumCol(rows, "paid"), balance: sumCol(rows, "balance") },
      };
    },
  },
  expiring: {
    title: "Expiring in 15 days",
    group: "Members",
    perm: "members.view",
    usesPeriod: false,
    async run(u) {
      const today = todayIso();
      const { rows: ms } = await listMembers(u, { all: true });
      const rows = ms
        .filter((m) => m.latestEnd && daysBetween(m.latestEnd, today) >= 0 && daysBetween(m.latestEnd, today) <= 15)
        .sort((a, b) => a.latestEnd!.localeCompare(b.latestEnd!))
        .map((m) => ({ code: m.code, name: m.name, phone: m.phone, plan: m.planName, ends: m.latestEnd, days: daysBetween(m.latestEnd!, today), due: m.outstanding }));
      return { columns: [{ key: "code", label: "ID" }, { key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "plan", label: "Plan" }, { key: "ends", label: "Ends" }, { key: "days", label: "Days left" }, { key: "due", label: "Dues", money: true }], rows };
    },
  },
  members: {
    title: "Member list",
    group: "Members",
    perm: "members.view",
    usesPeriod: false,
    async run(u) {
      const { rows: ms } = await listMembers(u, { all: true });
      const rows = ms.map((m) => ({ code: m.code, name: m.name, phone: m.phone, gender: m.gender, area: m.area, plan: m.planName, ends: m.latestEnd, status: m.status.replace("_", " ").toLowerCase(), due: m.outstanding }));
      return { columns: [{ key: "code", label: "ID" }, { key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "gender", label: "Gender" }, { key: "area", label: "Area" }, { key: "plan", label: "Plan" }, { key: "ends", label: "Ends" }, { key: "status", label: "Status" }, { key: "due", label: "Dues", money: true }], rows, totals: { due: sumCol(rows, "due") } };
    },
  },
  joins: {
    title: "New members by source",
    group: "Members",
    perm: "members.view",
    usesPeriod: true,
    async run(u, p) {
      const g = await db.member.groupBy({ by: ["source"], where: { ...branchScope(u), deletedAt: null, createdAt: { gte: fromIso(p.from), lt: new Date(fromIso(p.to).getTime() + 86_400_000) } }, _count: { _all: true } });
      const rows = g.map((x) => ({ source: x.source, members: x._count._all })).sort((a, b) => b.members - a.members);
      return { columns: [{ key: "source", label: "Source" }, { key: "members", label: "New members" }], rows, totals: { members: sumCol(rows, "members") } };
    },
  },
};

export const reportList = (u: CurrentUser) => Object.entries(REPORTS).filter(([, d]) => u.can(d.perm)).map(([key, d]) => ({ key, ...d }));

export function toCsv(r: Report): string {
  const esc = (v: Cell) => {
    const s = v == null ? "" : String(v);
    // Neutralise spreadsheet formulas (CSV injection).
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const cell = (c: Column, v: Cell) => (c.money && typeof v === "number" ? (v / 100).toFixed(2) : v);
  const lines = [r.columns.map((c) => esc(c.label)).join(",")];
  for (const row of r.rows) lines.push(r.columns.map((c) => esc(cell(c, row[c.key] ?? null))).join(","));
  if (r.totals) lines.push(r.columns.map((c, i) => esc(i === 0 ? "Total" : cell(c, r.totals![c.key] ?? null))).join(","));
  return lines.join("\n") + "\n";
}
