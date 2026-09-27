import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { ledger, monthOverview, monthPeriod, profitAndLoss } from "@/lib/services/accounting";
import { todayIso } from "@/lib/services/time";
import { Badge, Button, Card, Input, Notice, PageHeader, cx } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { fmtDate, formatInr } from "@/lib/format";
import { METHODS } from "@/lib/validation/billing";
import { lock, unlock } from "./actions";

export const metadata = { title: "Accounting · Fitron" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ymLabel = (ym: string) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;

function Rows({ items, total, label }: { items: { key: string; amount: number }[]; total: number; label: string }) {
  return (
    <dl className="text-sm">
      {items.length === 0 && <p className="text-muted">Nothing in this period.</p>}
      {items.map((r) => (
        <div key={r.key} className="flex justify-between border-b border-line py-2">
          <dt>{r.key}</dt>
          <dd>{formatInr(r.amount)}</dd>
        </div>
      ))}
      <div className="flex justify-between py-2 font-semibold">
        <dt>{label}</dt>
        <dd>{formatInr(total)}</dd>
      </div>
    </dl>
  );
}

export default async function AccountingPage({ searchParams }: PageProps<"/accounting">) {
  const u = await requirePermission("accounting.view");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const tab = s("tab") ?? "pl";
  const today = todayIso();
  const month = monthPeriod(today.slice(0, 7));
  const period = { from: s("from") ?? month.from, to: s("to") ?? today };
  const method = s("method") ?? "Cash";
  const tabs = [
    ["pl", "Profit & loss"],
    ["ledger", "Cash & bank book"],
    ["months", "Month-end & locks"],
  ];

  return (
    <>
      <PageHeader title="Accounting" subtitle={u.branch === "ALL" ? "All branches" : u.branches.find((b) => b.id === u.branch)?.name} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/accounting?tab=${k}`} className={cx("rounded-full border px-3 py-1.5 text-sm", tab === k ? "border-accent bg-accent-soft text-accent" : "border-line")}>
            {l}
          </Link>
        ))}
      </div>
      {tab !== "months" && (
        <form className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value={tab} />
          {tab === "ledger" && (
            <select name="method" defaultValue={method} className="min-h-10 rounded-md border border-line bg-bg px-3" aria-label="Method">
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          )}
          <Input name="from" type="date" defaultValue={period.from} aria-label="From" className="w-auto!" />
          <Input name="to" type="date" defaultValue={period.to} aria-label="To" className="w-auto!" />
          <Button>Show</Button>
        </form>
      )}
      {tab === "pl" && <ProfitLoss u={u} period={period} />}
      {tab === "ledger" && <Ledger u={u} period={period} method={method} />}
      {tab === "months" && <Months u={u} error={s("error")} />}
    </>
  );
}

async function ProfitLoss({ u, period }: { u: Awaited<ReturnType<typeof requirePermission>>; period: { from: string; to: string } }) {
  const pl = await profitAndLoss(u, period);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Revenue", pl.totalRevenue],
          ["Expenses", pl.totalExpenses],
          ["Net profit", pl.net],
          ["Collected", pl.collected],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-xl border border-line bg-surface p-4">
            <div className="text-sm text-muted">{k}</div>
            <div className={cx("mt-1 text-2xl font-semibold", k === "Net profit" && (v as number) < 0 && "text-alert")}>{formatInr(v as number)}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Revenue (net of GST)">
          <Rows items={pl.revenue} total={pl.totalRevenue} label="Total revenue" />
          <p className="mt-2 text-sm text-muted">GST collected on these invoices: {formatInr(pl.gstCollected)}</p>
        </Card>
        <Card title="Expenses">
          <Rows items={pl.expenseGroups} total={pl.totalExpenses} label="Total expenses" />
        </Card>
        <Card title="Collections by method" className="md:col-span-2">
          <Rows items={pl.collectedByMethod} total={pl.collected} label="Total collected" />
        </Card>
      </div>
      <p className="mt-4 text-sm text-muted">
        {fmtDate(period.from)} to {fmtDate(period.to)}. Revenue is counted on the invoice date; collections on the payment date. Cancelled invoices and voided expenses are left out.
      </p>
    </>
  );
}

async function Ledger({ u, period, method }: { u: Awaited<ReturnType<typeof requirePermission>>; period: { from: string; to: string }; method: string }) {
  const l = await ledger(u, method, period);
  return (
    <Card title={`${method} book`} action={<span className="text-sm">In {formatInr(l.totalIn)} · Out {formatInr(l.totalOut)} · Net {formatInr(l.totalIn - l.totalOut)}</span>}>
      {l.rows.length === 0 ? (
        <p className="text-sm text-muted">No {method} movements in this period.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-normal sm:px-0">Date</th>
                <th className="py-2 font-normal">Ref</th>
                <th className="py-2 font-normal">Details</th>
                <th className="py-2 text-right font-normal">In</th>
                <th className="py-2 text-right font-normal">Out</th>
                <th className="px-4 py-2 text-right font-normal sm:px-0">Running</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {l.rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 sm:px-0">{fmtDate(r.date)}</td>
                  <td className="py-2">{r.link ? <Link href={r.link} className="text-accent">{r.ref}</Link> : r.ref}</td>
                  <td className="py-2">{r.text}</td>
                  <td className="py-2 text-right">{r.in ? formatInr(r.in) : ""}</td>
                  <td className="py-2 text-right">{r.out ? formatInr(r.out) : ""}</td>
                  <td className="px-4 py-2 text-right sm:px-0">{formatInr(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function Months({ u, error }: { u: Awaited<ReturnType<typeof requirePermission>>; error?: string }) {
  const months = await monthOverview(u);
  const current = todayIso().slice(0, 7);
  return (
    <>
      {error && <div className="mb-4"><Notice tone="alert">{error}</Notice></div>}
      <p className="mb-4 text-sm text-muted">
        Locking a month stops anyone except a Super Admin from adding, cancelling or reversing anything dated in it. Lock a month once its books are checked.
      </p>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          {months.map((m) => {
            const locked = m.lockedBranches === m.branches;
            return (
              <li key={m.month} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <Link href={`/accounting?tab=pl&from=${monthPeriod(m.month).from}&to=${monthPeriod(m.month).to}`} className="w-24 font-semibold hover:text-accent">
                  {ymLabel(m.month)}
                </Link>
                <span className="flex-1 text-sm text-muted">
                  Revenue {formatInr(m.revenue)} · Expenses {formatInr(m.expenses)} · Net <span className={m.net < 0 ? "text-alert" : ""}>{formatInr(m.net)}</span>
                </span>
                {locked ? <Badge tone="accent">Locked</Badge> : m.lockedBranches > 0 ? <Badge>Partly locked</Badge> : m.month === current ? <Badge>Open (current)</Badge> : <Badge tone="ok">Open</Badge>}
                {!locked && m.month < current && u.can("months.lock") && (
                  <form action={lock.bind(null, m.month)}>
                    <ConfirmButton confirm={`Lock ${ymLabel(m.month)}? Only a Super Admin can change it afterwards.`}>Lock</ConfirmButton>
                  </form>
                )}
                {m.lockedBranches > 0 && u.can("months.unlock") && (
                  <form action={unlock.bind(null, m.month)}>
                    <ConfirmButton variant="danger" confirm={`Unlock ${ymLabel(m.month)}?`}>
                      Unlock
                    </ConfirmButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
