import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { listInvoices } from "@/lib/services/billing";
import { Button, Empty, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { InvoiceStatusBadge, INVOICE_STATUS_LABEL } from "@/components/invoice-status";
import { fmtDate, formatInr } from "@/lib/format";

export const metadata = { title: "Invoices · Fitron" };

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const u = await requirePermission("invoices.view");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const f = { q: s("q"), status: s("status"), from: s("from"), to: s("to") };
  const { rows } = await listInvoices(u, f);
  const totals = rows.filter((r) => r.status !== "CANCELLED").reduce((a, r) => ({ total: a.total + r.total, balance: a.balance + r.balance }), { total: 0, balance: 0 });

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={`${rows.length} shown · ${formatInr(totals.total)} billed · ${formatInr(totals.balance)} due`}
        actions={u.can("invoices.create") && <LinkButton href="/invoices/new" variant="primary">New invoice</LinkButton>}
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <Input name="q" defaultValue={f.q} placeholder="Invoice no., member name or phone" aria-label="Search" />
        <Select name="status" defaultValue={f.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(INVOICE_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
          <option value="OVERDUE">Overdue</option>
        </Select>
        <Input name="from" type="date" defaultValue={f.from} aria-label="From" />
        <Input name="to" type="date" defaultValue={f.to} aria-label="To" />
        <Button>Filter</Button>
      </form>
      {rows.length === 0 ? (
        <Empty>No invoices match.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/invoices/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2">
                  <span className="w-24 font-semibold">{r.number}</span>
                  <span className="min-w-0 flex-1 truncate">{r.member.name}</span>
                  <span className="text-sm text-muted">{fmtDate(r.date)}</span>
                  <span className="w-28 text-right font-semibold">{formatInr(r.total)}</span>
                  <InvoiceStatusBadge status={r.status} overdueDays={r.overdueDays} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
