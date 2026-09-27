import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { listPayments } from "@/lib/services/billing";
import { Badge, Button, Empty, Input, PageHeader, Select } from "@/components/ui";
import { fmtDate, formatInr } from "@/lib/format";
import { METHODS } from "@/lib/validation/billing";

export const metadata = { title: "Payments · Fitron" };

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const u = await requirePermission("invoices.view");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const f = { q: s("q"), method: s("method"), from: s("from"), to: s("to") };
  const rows = await listPayments(u, f);
  const ok = rows.filter((r) => r.status === "SUCCESS");
  const byMethod = ok.reduce<Record<string, number>>((m, r) => ((m[r.method] = (m[r.method] ?? 0) + r.amount), m), {});

  return (
    <>
      <PageHeader title="Payments" subtitle={`${formatInr(ok.reduce((a, r) => a + r.amount, 0))} received in ${ok.length} payments`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(byMethod).map(([m, amt]) => (
          <Badge key={m} tone="accent">
            {m}: {formatInr(amt)}
          </Badge>
        ))}
      </div>
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <Input name="q" defaultValue={f.q} placeholder="Payment no., reference or member" aria-label="Search" />
        <Select name="method" defaultValue={f.method ?? ""} aria-label="Method">
          <option value="">Any method</option>
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
        <Input name="from" type="date" defaultValue={f.from} aria-label="From" />
        <Input name="to" type="date" defaultValue={f.to} aria-label="To" />
        <Button>Filter</Button>
      </form>
      {rows.length === 0 ? (
        <Empty>No payments match.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/invoices/${p.invoice.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2">
                  <span className="w-24 font-semibold">{p.code}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {p.member.name} <span className="text-muted">· {p.invoice.number}</span>
                  </span>
                  <span className="text-sm text-muted">
                    {fmtDate(p.date)} · {p.method}
                  </span>
                  <span className={p.status === "REVERSED" ? "w-28 text-right text-muted line-through" : "w-28 text-right font-semibold"}>{formatInr(p.amount)}</span>
                  {p.status === "REVERSED" && <Badge tone="alert">Reversed</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
