import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/current";
import { getPurchase } from "@/lib/services/purchases";
import { Badge, Card, PageHeader, TABLE, TD, TH } from "@/components/ui";
import { fmtDate, fmtStamp, formatInr } from "@/lib/format";
import { todayIso, toIso } from "@/lib/services/time";
import { CancelPurchase, PayVendorForm } from "../purchase-forms";

export const metadata = { title: "Purchase · Fitron" };

const TYPE = { STOCK: "Stock", ASSET: "Asset", EXPENSE: "Expense" } as const;

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
    if (l.type === "EXPENSE") return <span>{p.categories.find((y) => y.id === l.category)?.name ?? l.category}</span>;
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
            <table className={`${TABLE} min-w-[560px]`}>
              <thead>
                <tr>
                  <th className={TH}>Type</th>
                  <th className={TH}>Item</th>
                  <th className={TH}>Ref</th>
                  <th className={`${TH} text-right`}>Rate</th>
                  <th className={`${TH} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {p.lines.map((l) => (
                  <tr key={l.id}>
                    <td className={TD}>{TYPE[l.type as keyof typeof TYPE]}</td>
                    <td className={TD}>
                      {l.description}
                      {l.qty > 1 ? ` ×${l.qty}` : ""}
                    </td>
                    <td className={`${TD} text-xs text-muted`}>{link(l)}</td>
                    <td className={`${TD} text-right`}>
                      {formatInr(l.rate)}
                      {Number(l.gstPct) > 0 ? ` + ${Number(l.gstPct)}% GST` : ""}
                    </td>
                    <td className={`${TD} text-right`}>{formatInr(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex max-w-[560px] justify-between text-base font-semibold">
            <span>Bill total</span>
            <span className="tabular-nums">{formatInr(p.total)}</span>
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
