import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { ACCOUNTING_TABS, SectionTabs } from "@/components/section-tabs";
import { listPurchases } from "@/lib/services/purchases";
import { Badge, Button, Empty, Input, LinkButton, PageHeader } from "@/components/ui";
import { cx } from "@/components/ui";
import { fmtDate, formatInr } from "@/lib/format";

export const metadata = { title: "Purchases · Fitron" };

const TABS = [
  ["", "All bills"],
  ["payable", "Supplier dues"],
  ["cancelled", "Cancelled"],
] as const;

export default async function PurchasesPage({ searchParams }: PageProps<"/purchases">) {
  const u = await requirePermission("purchases.manage");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const show = (typeof sp.show === "string" ? sp.show : "") as "" | "payable" | "cancelled";
  const rows = await listPurchases(u, { q, show });
  const due = show === "cancelled" ? 0 : rows.reduce((s, p) => s + p.balance, 0);
  return (
    <>
      <PageHeader
        title="Purchases"
        subtitle={`${rows.length} bill${rows.length === 1 ? "" : "s"} · ${formatInr(rows.reduce((s, p) => s + p.total, 0))}${due ? ` · ${formatInr(due)} owed to suppliers` : ""}`}
        actions={
          <LinkButton href="/purchases/new" variant="primary">
            Record a bill
          </LinkButton>
        }
      />
      <SectionTabs u={u} tabs={ACCOUNTING_TABS} current="/purchases" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([k, label]) => (
          <Link key={k} href={k ? `/purchases?show=${k}` : "/purchases"} className={cx("rounded-full border px-3 py-1 text-sm", show === k ? "border-accent text-accent" : "border-line text-muted hover:text-fg")}>
            {label}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          {show && <input type="hidden" name="show" value={show} />}
          <Input name="q" defaultValue={q ?? ""} placeholder="Supplier, bill or PUR no." aria-label="Search bills" />
          <Button>Search</Button>
        </form>
      </div>
      {rows.length === 0 ? (
        <Empty>{show === "payable" ? "Nothing owed to suppliers." : "No bills yet. Record supplier bills here: stock for the counter, equipment and other expenses on one bill."}</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">Bill</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Lines</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => {
                const kinds = [...new Set(p.lines.map((l) => ({ STOCK: "stock", ASSET: "equipment", EXPENSE: "expense" })[l.type as "STOCK"]))];
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/purchases/${p.id}`} className="font-semibold hover:text-accent">
                        {p.vendor}
                      </Link>
                      <span className="block text-xs text-muted">
                        {p.code}
                        {p.billNo ? ` · bill ${p.billNo}` : ""}
                        {u.branchIds.length > 1 ? ` · ${p.branch.name}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{fmtDate(p.date)}</td>
                    <td className="px-4 py-2.5">
                      {p.lines.length} · {kinds.join(", ")}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatInr(p.total)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {p.status === "CANCELLED" ? <Badge>Cancelled</Badge> : p.balance > 0 ? <span className="text-alert">{formatInr(p.balance)}</span> : <Badge tone="ok">Paid</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
