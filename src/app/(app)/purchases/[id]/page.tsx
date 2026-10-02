import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/current";
import { getPurchase } from "@/lib/services/purchases";
import { Badge, Card, PageHeader } from "@/components/ui";
import { fmtDate, fmtStamp, formatInr } from "@/lib/format";
import { todayIso, toIso } from "@/lib/services/time";
import { CancelPurchase, PayVendorForm } from "../purchase-forms";

export const metadata = { title: "Purchase · Fitron" };

const TYPE = { STOCK: "Stock", ASSET: "Equipment", EXPENSE: "Expense" } as const;

export default async function PurchasePage({ params }: PageProps<"/purchases/[id]">) {
  const u = await requirePermission("purchases.manage");
  const { id } = await params;
  const p = await getPurchase(u, id);
  if (!p) notFound();
  const active = p.status === "ACTIVE";
  const link = (l: (typeof p.lines)[number]) => {
    if (l.productId) {
      const x = p.products.find((y) => y.id === l.productId);
      return x ? <Link href={`/products/${x.id}`} className="text-accent">{x.sku}</Link> : null;
    }
    if (l.assetId) {
      const x = p.assets.find((y) => y.id === l.assetId);
      return x ? <Link href={`/assets/${x.id}`} className="text-accent">{x.code}</Link> : <span className="text-muted">removed</span>;
    }
    return null;
  };
  return (
    <>
      <PageHeader
        title={`${p.vendor} · ${p.code}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {!active ? <Badge>Cancelled</Badge> : p.balance > 0 ? <Badge tone="alert">{formatInr(p.balance)} due</Badge> : <Badge tone="ok">Paid</Badge>}
            {fmtDate(p.date)}
            {p.billNo ? ` · bill ${p.billNo}` : ""} · {formatInr(p.total)} incl. GST
            {u.branchIds.length > 1 ? ` · ${p.branch.name}` : ""}
          </span>
        }
      />
      {!active && <p className="mb-4 text-sm text-alert">Cancelled: {p.cancelReason}</p>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Lines" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 font-medium">Item</th>
                  <th className="py-2 text-right font-medium">Qty</th>
                  <th className="py-2 text-right font-medium">Rate</th>
                  <th className="py-2 text-right font-medium">GST</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {p.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2">
                      {l.description}
                      <span className="block text-xs text-muted">
                        {TYPE[l.type as keyof typeof TYPE]}
                        {l.type === "ASSET" && l.category ? ` · ${l.category}` : ""} {link(l)}
                      </span>
                    </td>
                    <td className="py-2 text-right">{l.qty}</td>
                    <td className="py-2 text-right">{formatInr(l.rate)}</td>
                    <td className="py-2 text-right">{Number(l.gstPct)}%</td>
                    <td className="py-2 text-right">{formatInr(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-semibold">
                  <td className="py-2" colSpan={4}>
                    Total
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatInr(p.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {p.notes && <p className="mt-3 text-sm text-muted">{p.notes}</p>}
        </Card>
        <div className="flex flex-col gap-6">
          <Card title="Payments">
            {p.payments.length === 0 ? (
              <p className="text-sm text-muted">Nothing paid yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {p.payments.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2 py-2">
                    <span>
                      {fmtDate(x.date)} · {x.method}
                      <span className="block text-xs text-muted">
                        {x.code}
                        {x.reference ? ` · ${x.reference}` : ""}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatInr(x.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 flex justify-between border-t border-line pt-2 text-sm font-semibold">
              <span>Balance</span>
              <span className="tabular-nums">{formatInr(p.balance)}</span>
            </p>
          </Card>
          {active && p.balance > 0 && (
            <Card title="Pay the supplier" id="pay">
              <PayVendorForm id={p.id} balance={p.balance} today={todayIso()} billDate={toIso(p.date)} />
            </Card>
          )}
          <Card title="Posted to">
            <ul className="divide-y divide-line text-sm">
              {p.expenses.map((x) => (
                <li key={x.id} className="flex justify-between gap-2 py-1.5">
                  <span>
                    {x.code} {x.capital ? <Badge>Capital</Badge> : null} {x.status === "VOID" ? <Badge>Void</Badge> : null}
                  </span>
                  <span className="text-muted">{x.method}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Recorded {fmtStamp(p.createdAt)}.</p>
          </Card>
          {active && (
            <Card title="Wrong bill or goods returned?">
              <CancelPurchase id={p.id} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
