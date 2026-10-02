import Link from "next/link";
import { DownloadSimpleIcon, LockSimpleIcon, LockSimpleOpenIcon, PrinterIcon } from "@phosphor-icons/react/dist/ssr";
import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { ACCOUNTING_TABS, SectionTabs } from "@/components/section-tabs";
import { ledger, monthOverview, monthPeriod, profitAndLoss } from "@/lib/services/accounting";
import { listInvoices } from "@/lib/services/billing";
import { REPORTS } from "@/lib/services/reports";
import { getSetting } from "@/lib/services/settings";
import { fromIso, todayIso } from "@/lib/services/time";
import { PERIODS, isPeriod, monthLabel, periodRange } from "@/lib/domain/periods";
import { AutoFilter } from "@/components/auto-filter";
import { Input, LinkButton, Notice, Segmented, Select, TABLE, TD, TH, TR, cx } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { PrintButton } from "@/components/print-button";
import { Tag } from "@/components/tag";
import { fmtDate, formatRupees } from "@/lib/format";
import { METHODS } from "@/lib/validation/billing";
import { lock, unlock } from "./actions";

export const metadata = { title: "Accounting · Fitron" };

type U = Awaited<ReturnType<typeof requirePermission>>;
const Line = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <div className={cx("flex justify-between gap-3 py-[5px] text-[15px]", strong && "font-semibold")}>
    <span>{k}</span>
    <span className="whitespace-nowrap">{v}</span>
  </div>
);

export default async function AccountingPage({ searchParams }: PageProps<"/accounting">) {
  const u = await requirePermission("accounting.view");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const tab = s("tab") === "ledger" ? "ledger" : s("tab") === "close" || s("tab") === "months" ? "close" : "pl";
  const branchLabel = u.branch === "ALL" ? "All branches (consolidated)" : (u.branches.find((b) => b.id === u.branch)?.name ?? "");

  return (
    <div className="flex flex-col gap-7 pt-4">
      <div>
        <div className="text-[11px] tracking-[0.1em] text-muted uppercase">{branchLabel}</div>
        <h1 className="mt-1 text-[28px] lg:text-[40px]">Accounting</h1>
      </div>
      <div className="-mb-7">
        <SectionTabs u={u} tabs={ACCOUNTING_TABS} current={tab === "pl" ? "/accounting" : `/accounting?tab=${tab}`} />
      </div>
      {tab === "pl" && <ProfitLoss u={u} s={s} branchLabel={branchLabel} />}
      {tab === "ledger" && <Ledger u={u} s={s} />}
      {tab === "close" && <Close u={u} s={s} />}
    </div>
  );
}

async function ProfitLoss({ u, s, branchLabel }: { u: U; s: (k: string) => string | undefined; branchLabel: string }) {
  const today = todayIso();
  const key = isPeriod(s("period")) ? s("period")! : "month";
  const legacy = s("from") && s("to") && !s("period");
  const r = legacy ? { from: s("from")!, to: s("to")!, label: `${fmtDate(s("from"))} – ${fmtDate(s("to"))}` } : periodRange(key as Parameters<typeof periodRange>[0], today, s("from"), s("to"));
  const current = legacy ? "custom" : key;
  const period = { from: r.from, to: r.to };
  const [pl, inPeriod, open, cash, capex, gym] = await Promise.all([
    profitAndLoss(u, period),
    listInvoices(u, { from: period.from, to: period.to }),
    listInvoices(u, { openOnly: true }),
    ledger(u, "Cash", { from: today, to: today }),
    db.expense.aggregate({ where: { orgId: u.orgId, branchId: { in: u.branchIds }, status: "ACTIVE", capital: true, date: { gte: fromIso(period.from), lte: fromIso(period.to) } }, _sum: { amount: true } }),
    getSetting<{ name?: string }>(u.orgId, "gym"),
  ]);
  const cashIn = pl.collectedByMethod.find((m) => m.key === "Cash")?.amount ?? 0;
  const expenses = [...pl.expenseGroups, ...(pl.depreciation ? [{ key: "Depreciation", amount: pl.depreciation }] : []), ...(pl.disposalLoss ? [{ key: "Loss on disposal of assets", amount: pl.disposalLoss }] : [])];
  const revenue = [...pl.revenue, ...(pl.disposalGain ? [{ key: "Gain on sale of assets", amount: pl.disposalGain }] : [])];
  const recon: [string, number][] = [
    ["Revenue invoiced", pl.totalRevenue],
    ["Tax collected", pl.gstCollected],
    ["Collected in period", pl.collected],
    ["Cash collections", cashIn],
    ["Bank / UPI / card collections", pl.collected - cashIn],
    ["Outstanding on these invoices", inPeriod.rows.reduce((a, i) => a + i.balance, 0)],
    ["Total outstanding receivables", open.rows.reduce((a, i) => a + i.balance, 0)],
    ["Cash in hand (est.)", cash.closing],
    ["Asset purchases (capitalised, not in P&L)", capex._sum.amount ?? 0],
    ["Depreciation charged (non-cash)", pl.depreciation],
  ];
  const csv = `/reports/revenue-category/csv?from=${period.from}&to=${period.to}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <Segmented options={PERIODS.map(([k, label]) => ({ key: k, label, href: `/accounting?period=${k}` }))} current={current} />
        <div className="flex gap-2">
          <PrintButton>
            <PrinterIcon size={16} weight="duotone" />
            Print / PDF
          </PrintButton>
          {u.can(REPORTS["revenue-category"]!.perm) && (
            <LinkButton href={csv} prefetch={false}>
              <DownloadSimpleIcon size={16} weight="duotone" />
              CSV
            </LinkButton>
          )}
        </div>
      </div>
      {current === "custom" && (
        <AutoFilter className="flex flex-wrap gap-3 print:hidden">
          <input type="hidden" name="period" value="custom" />
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            From
            <Input type="date" name="from" defaultValue={period.from} max={today} className="w-auto!" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            To
            <Input type="date" name="to" defaultValue={period.to} max={today} className="w-auto!" />
          </label>
        </AutoFilter>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-14">
        <section className="max-w-[560px]">
          <div className="text-[11px] tracking-[0.1em] text-muted uppercase">
            {gym?.name ?? "Your gym"} · {branchLabel}
          </div>
          <h2 className="mt-1 mb-0.5 text-[28px]">Profit &amp; Loss</h2>
          <div className="mb-[22px] text-[13px] text-muted">
            {fmtDate(period.from)} – {fmtDate(period.to)}
          </div>
          <h5 className="mb-1.5 text-[13px] tracking-[0.08em] uppercase">Revenue</h5>
          {revenue.length === 0 && <p className="text-sm text-muted">Nothing invoiced in this period.</p>}
          {revenue.map((x) => (
            <Line key={x.key} k={x.key} v={formatRupees(x.amount)} />
          ))}
          <div className="mt-1 flex justify-between border-t border-fg py-2 font-semibold">
            <span>Total revenue</span>
            <span>{formatRupees(pl.totalRevenue + pl.disposalGain)}</span>
          </div>
          <h5 className="mt-[22px] mb-1.5 text-[13px] tracking-[0.08em] uppercase">Expenses</h5>
          {expenses.length === 0 && <p className="text-sm text-muted">No expenses in this period.</p>}
          {expenses.map((x) => (
            <Line key={x.key} k={x.key} v={formatRupees(x.amount)} />
          ))}
          <div className="mt-1 flex justify-between border-t border-fg py-2 font-semibold">
            <span>Total expenses</span>
            <span>{formatRupees(pl.totalExpenses + pl.depreciation + pl.disposalLoss)}</span>
          </div>
          <div className={cx("mt-[18px] flex justify-between border-t-[3px] border-double border-fg py-3 text-[22px] font-semibold", pl.net < 0 && "text-alert-700")}>
            <span>{pl.net < 0 ? "Net loss" : "Net profit"}</span>
            <span>{formatRupees(pl.net)}</span>
          </div>
          <p className="mt-2 text-[12.5px] text-muted">Revenue is net of GST, on the invoice date. Equipment bought is not an expense here; its depreciation is.</p>
        </section>
        <section>
          <h3 className="mb-1.5 text-xl">Reconciliation</h3>
          <p className="mb-3.5 text-[13px] text-muted">Computed from invoices, payments and expenses in the same period.</p>
          {recon.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line-soft py-[7px] text-[15px]">
              <span>{k}</span>
              <span className="font-semibold whitespace-nowrap">{formatRupees(v)}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

async function Ledger({ u, s }: { u: U; s: (k: string) => string | undefined }) {
  const today = todayIso();
  const method = METHODS.includes(s("method") as (typeof METHODS)[number]) ? s("method")! : "Cash";
  const period = { from: s("from") ?? monthPeriod(today.slice(0, 7)).from, to: s("to") ?? today };
  const l = await ledger(u, method, period);
  const qs = (m: string) => `/accounting?${new URLSearchParams({ tab: "ledger", method: m, from: period.from, to: period.to })}`;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Segmented options={METHODS.map((m) => ({ key: m, label: m === "Bank Transfer" ? "Bank" : m, href: qs(m) }))} current={method} />
        <AutoFilter className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tab" value="ledger" />
          <input type="hidden" name="method" value={method} />
          <Input type="date" name="from" defaultValue={period.from} aria-label="From" className="w-auto!" />
          <Input type="date" name="to" defaultValue={period.to} aria-label="To" className="w-auto!" />
        </AutoFilter>
      </div>
      <div className="flex flex-wrap gap-x-10 gap-y-3 text-sm">
        {l.broughtForward !== null && (
          <span>
            Brought forward <strong>{formatRupees(l.broughtForward)}</strong>
          </span>
        )}
        <span>
          In <strong>{formatRupees(l.totalIn)}</strong>
        </span>
        <span>
          Out <strong>{formatRupees(l.totalOut)}</strong>
        </span>
        <span>
          Closing <strong>{formatRupees(l.closing)}</strong>
        </span>
      </div>
      {l.rows.length === 0 ? (
        <p className="text-sm text-muted">No {method} movements in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={cx(TABLE, "min-w-[720px]")}>
            <thead>
              <tr>
                <th className={TH}>Date</th>
                <th className={TH}>Ref</th>
                <th className={TH}>Details</th>
                <th className={cx(TH, "text-right")}>In</th>
                <th className={cx(TH, "text-right")}>Out</th>
                <th className={cx(TH, "text-right")}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {l.rows.map((r, i) => (
                <tr key={i} className={TR}>
                  <td className={cx(TD, "whitespace-nowrap")}>{fmtDate(r.date)}</td>
                  <td className={cx(TD, "whitespace-nowrap")}>
                    {r.link ? (
                      <Link href={r.link} className="text-accent">
                        {r.ref}
                      </Link>
                    ) : (
                      r.ref
                    )}
                  </td>
                  <td className={TD}>{r.text}</td>
                  <td className={cx(TD, "text-right whitespace-nowrap")}>{r.in ? formatRupees(r.in) : ""}</td>
                  <td className={cx(TD, "text-right whitespace-nowrap")}>{r.out ? formatRupees(r.out) : ""}</td>
                  <td className={cx(TD, "text-right whitespace-nowrap")}>{formatRupees(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[13px] text-muted">In: member payments and asset sale proceeds. Out: expenses and supplier payments made by {method}.</div>
    </>
  );
}

async function Close({ u, s }: { u: U; s: (k: string) => string | undefined }) {
  const months = await monthOverview(u);
  const current = todayIso().slice(0, 7);
  const m = months.find((x) => x.month === s("month")) ?? months.find((x) => x.month < current) ?? months[0]!;
  const locked = m.lockedBranches === m.branches;
  const lockedList = months.filter((x) => x.lockedBranches > 0).map((x) => monthLabel(x.month));
  const label = monthLabel(m.month);
  return (
    <>
      {s("error") && <Notice tone="alert">{s("error")}</Notice>}
      <AutoFilter className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="close" />
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Month
          <Select name="month" defaultValue={m.month} className="w-auto!">
            {months.map((x) => (
              <option key={x.month} value={x.month}>
                {monthLabel(x.month)}
              </option>
            ))}
          </Select>
        </label>
        <span className="mb-2">
          <Tag label={locked ? "Locked" : m.lockedBranches > 0 ? "Partly locked" : m.month === current ? "Open (current)" : "Open"} />
        </span>
      </AutoFilter>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-14">
        <section className="max-w-[560px]">
          <h3 className="mb-3.5 text-[22px]">Summary for {label}</h3>
          {(
            [
              ["Revenue", m.revenue, false],
              ["Expenses (incl. depreciation)", m.expenses, false],
              [m.net < 0 ? "Net loss" : "Net profit", m.net, true],
              ["Collected", m.collected, false],
            ] as [string, number, boolean][]
          ).map(([k, v, strong]) => (
            <div key={k} className={cx("flex justify-between gap-3 border-b border-line-soft py-[7px] text-[15px]", strong && "font-semibold")}>
              <span>{k}</span>
              <span>{formatRupees(v)}</span>
            </div>
          ))}
          <Link href={`/accounting?period=custom&from=${monthPeriod(m.month).from}&to=${monthPeriod(m.month).to}`} className="mt-3 inline-block text-sm font-semibold text-accent">
            Full profit &amp; loss for {label}
          </Link>
        </section>
        <section className="flex max-w-[420px] flex-col gap-3.5">
          <h3 className="text-xl">Month lock</h3>
          <p className="m-0 text-sm text-muted">
            {locked
              ? `${label} is locked. Nothing dated in it can be added, cancelled or reversed except by a Super Admin.`
              : m.month === current
                ? "The current month can be locked once it is over."
                : `Locking ${label} stops anyone except a Super Admin from adding, cancelling or reversing anything dated in it. Lock it once its books are checked.`}
          </p>
          <div className="flex flex-wrap gap-2.5">
            {!locked && m.month < current && u.can("months.lock") && (
              <form action={lock.bind(null, m.month)}>
                <ConfirmButton variant="primary" confirm={`Lock ${label}? Only a Super Admin can change it afterwards.`}>
                  <LockSimpleIcon size={16} weight="duotone" />
                  Lock {label}
                </ConfirmButton>
              </form>
            )}
            {m.lockedBranches > 0 && u.can("months.unlock") && (
              <form action={unlock.bind(null, m.month)}>
                <ConfirmButton confirm={`Unlock ${label}?`}>
                  <LockSimpleOpenIcon size={16} weight="duotone" />
                  Unlock (Super Admin)
                </ConfirmButton>
              </form>
            )}
          </div>
          <div className="text-[13px] text-muted">Locked months: {lockedList.length ? lockedList.join(", ") : "none"}</div>
        </section>
      </div>
    </>
  );
}
