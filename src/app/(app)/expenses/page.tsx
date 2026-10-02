import Link from "next/link";
import { DownloadSimpleIcon, PlusIcon, ReceiptIcon } from "@phosphor-icons/react/dist/ssr";
import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { listCategories, listExpenses } from "@/lib/services/expenses";
import { REPORTS } from "@/lib/services/reports";
import { fromIso, todayIso } from "@/lib/services/time";
import { monthEnd, monthsBack } from "@/lib/domain/periods";
import { AutoFilter } from "@/components/auto-filter";
import { LinkButton, Select, TABLE, TD, TH, TR, cx } from "@/components/ui";
import { Tag } from "@/components/tag";
import { fmtDate, fmtMonthShort, formatRupees } from "@/lib/format";
import { ExpenseForm, VoidExpense } from "./expense-form";

export const metadata = { title: "Expenses · Fitron" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const u = await requirePermission("expenses.manage");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = todayIso();
  const months = monthsBack(today);
  const month = s("month") === "all" ? "all" : months.includes(s("month") ?? "") ? s("month")! : today.slice(0, 7);
  const cat = s("cat") || undefined;
  const range = month === "all" ? {} : { from: `${month}-01`, to: monthEnd(month) };
  const [rows, cats, trend] = await Promise.all([
    listExpenses(u, { ...range, categoryId: cat, includeVoid: s("void") === "1" }),
    listCategories(),
    db.expense.findMany({
      where: { orgId: u.orgId, branchId: { in: u.branchIds }, status: "ACTIVE", capital: false, ...(cat ? { categoryId: cat } : {}), date: { gte: fromIso(`${months[0]}-01`) } },
      select: { date: true, amount: true },
    }),
  ]);
  const live = rows.filter((r) => r.status === "ACTIVE");
  const total = live.reduce((a, r) => a + r.amount, 0);
  const byCat = [...live.reduce((m, r) => m.set(r.category.name, (m.get(r.category.name) ?? 0) + r.amount), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...byCat.map(([, v]) => v));
  const perMonth = months.map((k) => ({ k, v: trend.filter((e) => e.date.toISOString().startsWith(k)).reduce((a, e) => a + e.amount, 0) }));
  const maxMonth = Math.max(1, ...perMonth.map((m) => m.v));
  const canExport = u.can(REPORTS.expenses!.perm);
  const exportHref = `/reports/expenses/csv?${new URLSearchParams(month === "all" ? { from: `${months[0]}-01`, to: today } : { from: range.from!, to: range.to! })}`;
  const adding = s("add") === "1";

  return (
    <div className="flex flex-col gap-7 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] tracking-[0.1em] text-muted uppercase">{month === "all" ? "All months" : monthName(month)}</div>
          <h1 className="mt-1 text-[28px] lg:text-[40px]">Expenses</h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <LinkButton href="/expenses?add=1#add" variant="primary">
            <PlusIcon size={17} weight="duotone" />
            Add expense
          </LinkButton>
          {u.can("purchases.manage") && (
            <LinkButton href="/purchases/new">
              <ReceiptIcon size={17} weight="duotone" />
              Purchase bill
            </LinkButton>
          )}
          {canExport && (
            <LinkButton href={exportHref} prefetch={false}>
              <DownloadSimpleIcon size={17} weight="duotone" />
              Export CSV
            </LinkButton>
          )}
        </div>
      </div>

      {adding && (
        <section id="add" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-[18px]">
          <h3 className="text-lg">Add expense</h3>
          <ExpenseForm categories={cats} today={today} />
        </section>
      )}

      <AutoFilter className="flex flex-wrap items-center gap-2.5">
        <Select name="month" defaultValue={month} aria-label="Month" className="w-auto!">
          <option value="all">All months</option>
          {[...months].reverse().map((k) => (
            <option key={k} value={k}>
              {monthName(k)}
            </option>
          ))}
        </Select>
        <Select name="cat" defaultValue={cat ?? ""} aria-label="Category" className="w-auto!">
          <option value="">All categories</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 px-1 text-sm text-muted">
          <input type="checkbox" name="void" value="1" defaultChecked={s("void") === "1"} className="size-4" /> Show voided
        </label>
      </AutoFilter>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-10">
        <section>
          <div className="text-[11px] tracking-[0.08em] text-muted uppercase">Total</div>
          <div className="mb-[18px] text-[34px] font-semibold">{formatRupees(total)}</div>
          <div className="flex flex-col gap-2.5">
            {byCat.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
                <span>{k}</span>
                <span className="h-2.5 bg-neutral-200">
                  <span className="block h-full bg-fg/50" style={{ width: `${(v / maxCat) * 100}%` }} />
                </span>
                <span className="whitespace-nowrap">{formatRupees(v)}</span>
              </div>
            ))}
            {byCat.length === 0 && <p className="text-sm text-muted">No expenses in this period.</p>}
          </div>
        </section>
        <section>
          <h3 className="mb-3.5 text-xl">Monthly expense trend</h3>
          <div className="flex h-[180px] items-end gap-1.5">
            {perMonth.map((m) => (
              <div key={m.k} title={`${monthName(m.k)}: ${formatRupees(m.v)}`} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5">
                <div className="flex min-h-0 flex-1 items-end">
                  <div className={cx("w-full", m.k === month ? "bg-accent" : "bg-fg/40")} style={{ height: `${(m.v / maxMonth) * 100}%` }} />
                </div>
                <div className="overflow-hidden text-center text-[10px] whitespace-nowrap text-muted">{fmtMonthShort(m.k)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className={cx(TABLE, "min-w-[960px]")}>
            <thead>
              <tr>
                {["Expense", "Date", "Category", "Description", "Vendor", "Method", "Bill no."].map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
                <th className={cx(TH, "text-right")}>Amount</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cx(TR, r.status === "VOID" && "text-muted")}>
                  <td className={cx(TD, "whitespace-nowrap")}>{r.code}</td>
                  <td className={cx(TD, "whitespace-nowrap")}>{fmtDate(r.date)}</td>
                  <td className={TD}>
                    {r.category.name}
                    {r.capital ? " · capitalised" : ""}
                  </td>
                  <td className={cx(TD, r.status === "VOID" && "line-through")}>
                    {r.description}
                    {r.status === "VOID" && <div className="text-xs no-underline">Voided: {r.voidReason}</div>}
                  </td>
                  <td className={TD}>{r.vendor || "—"}</td>
                  <td className={TD}>{r.method}</td>
                  <td className={cx(TD, "text-[13px]")}>
                    {r.purchaseId ? (
                      <Link href={`/purchases/${r.purchaseId}`} className="text-accent">
                        {r.billNo || "Purchase bill"}
                      </Link>
                    ) : r.assetId ? (
                      <Link href={`/assets/${r.assetId}`} className="text-accent">
                        Asset
                      </Link>
                    ) : (
                      r.billNo || "—"
                    )}
                  </td>
                  <td className={cx(TD, "text-right whitespace-nowrap")}>{formatRupees(r.amount)}</td>
                  <td className={cx(TD, "text-right")}>
                    {r.status === "VOID" ? <Tag label="Void" /> : !r.purchaseId && !r.assetId && u.can("expenses.void") && <VoidExpense id={r.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
