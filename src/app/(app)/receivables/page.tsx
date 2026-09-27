import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { listReceivables } from "@/lib/services/billing";
import { Empty, PageHeader, cx } from "@/components/ui";
import { InvoiceStatusBadge } from "@/components/invoice-status";
import { fmtDate, formatInr } from "@/lib/format";

export const metadata = { title: "Receivables · Fitron" };

const TABS = [
  ["", "All open"],
  ["due_today", "Due today"],
  ["overdue", "Overdue"],
  ["partial", "Partly paid"],
  ["unpaid", "Unpaid"],
] as const;

export default async function ReceivablesPage({ searchParams }: PageProps<"/receivables">) {
  const u = await requirePermission("invoices.view");
  const { filter } = await searchParams;
  const f = typeof filter === "string" ? filter : "";
  const { list, counts, total } = await listReceivables(u, f);
  return (
    <>
      <PageHeader title="Receivables" subtitle={`${formatInr(total)} outstanding`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={k ? `/receivables?filter=${k}` : "/receivables"}
            className={cx("rounded-full border px-3 py-1.5 text-sm", f === k ? "border-accent bg-accent-soft text-accent" : "border-line")}
          >
            {label}
            {k && counts[k] ? ` · ${counts[k].n}` : ""}
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty>Nothing outstanding here.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <li key={r.id}>
                <Link href={`/invoices/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.member.name}</span>
                    <span className="text-sm text-muted">
                      {r.number} · due {fmtDate(r.dueDate)} · {r.member.phone}
                    </span>
                  </span>
                  <InvoiceStatusBadge status={r.status} overdueDays={r.overdueDays} />
                  <span className="w-28 text-right font-semibold text-alert">{formatInr(r.balance)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
