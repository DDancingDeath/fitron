import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/current";
import { getInvoice } from "@/lib/services/billing";
import { todayIso } from "@/lib/services/time";
import { Badge, Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { InvoiceStatusBadge } from "@/components/invoice-status";
import { fmtDate, formatInr, fmtStamp } from "@/lib/format";
import { CancelInvoice, CollectForm, ReversePayment } from "./invoice-forms";

export const metadata = { title: "Invoice · Fitron" };

export default async function InvoicePage({ params, searchParams }: PageProps<"/invoices/[id]">) {
  const u = await requirePermission("invoices.view");
  const { id } = await params;
  const { created } = await searchParams;
  const inv = await getInvoice(u, id);
  if (!inv) notFound();
  const cancelled = inv.status === "CANCELLED";
  const half = inv.gstType === "CGST+SGST";

  return (
    <>
      <PageHeader
        title={inv.number}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {u.can("members.view") ? (
              <Link href={`/members/${inv.memberId}`} className="hover:text-accent">
                {inv.member.name} ({inv.member.code})
              </Link>
            ) : (
              `${inv.member.name} (${inv.member.code})`
            )}
            · {fmtDate(inv.date)} <InvoiceStatusBadge status={inv.status} overdueDays={inv.overdueDays} />
          </span>
        }
        actions={
          <>
            <LinkButton href={`/invoices/${inv.id}/pdf`} prefetch={false} target="_blank">
              Download PDF
            </LinkButton>
            {u.can("members.view") && <LinkButton href={`/members/${inv.memberId}`}>Member</LinkButton>}
          </>
        }
      />
      {created && <div className="mb-4"><Notice tone="ok">Invoice created.</Notice></div>}
      {cancelled && (
        <div className="mb-4">
          <Notice tone="alert">
            Cancelled on {fmtStamp(inv.cancelledAt)} by {inv.staffName(inv.cancelledById ?? "")}: {inv.cancelReason}
          </Notice>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Items" className="lg:col-span-2">
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-normal sm:px-0">Description</th>
                  <th className="py-2 text-right font-normal">Qty</th>
                  <th className="py-2 text-right font-normal">Rate</th>
                  <th className="py-2 text-right font-normal">Discount</th>
                  <th className="py-2 text-right font-normal">GST</th>
                  <th className="px-4 py-2 text-right font-normal sm:px-0">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {inv.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-4 py-2 sm:px-0">
                      {it.description}
                      <div className="text-xs text-muted">{it.category}</div>
                    </td>
                    <td className="py-2 text-right">{it.qty}</td>
                    <td className="py-2 text-right">{formatInr(it.rate)}</td>
                    <td className="py-2 text-right">{it.discount ? formatInr(it.discount) : "—"}</td>
                    <td className="py-2 text-right">{Number(it.taxRate) ? `${Number(it.taxRate)}%` : "—"}</td>
                    <td className="px-4 py-2 text-right sm:px-0">{formatInr(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted">Subtotal</dt>
            <dd className="text-right">{formatInr(inv.subtotal)}</dd>
            {inv.discount > 0 && (
              <>
                <dt className="text-muted">Discount</dt>
                <dd className="text-right">− {formatInr(inv.discount)}</dd>
              </>
            )}
            {inv.tax > 0 &&
              (half ? (
                <>
                  <dt className="text-muted">CGST ({Number(inv.gstRate) / 2}%)</dt>
                  <dd className="text-right">{formatInr(Math.floor(inv.tax / 2))}</dd>
                  <dt className="text-muted">SGST ({Number(inv.gstRate) / 2}%)</dt>
                  <dd className="text-right">{formatInr(inv.tax - Math.floor(inv.tax / 2))}</dd>
                </>
              ) : (
                <>
                  <dt className="text-muted">IGST ({Number(inv.gstRate)}%)</dt>
                  <dd className="text-right">{formatInr(inv.tax)}</dd>
                </>
              ))}
            <dt className="font-semibold">Total</dt>
            <dd className="text-right text-lg font-semibold">{formatInr(inv.total)}</dd>
            <dt className="text-muted">Paid</dt>
            <dd className="text-right">{formatInr(inv.paid)}</dd>
            <dt className="font-semibold">Balance</dt>
            <dd className={inv.balance > 0 ? "text-right font-semibold text-alert" : "text-right font-semibold"}>{formatInr(inv.balance)}</dd>
          </dl>
          {inv.membership && (
            <p className="mt-4 text-sm text-muted">
              Membership {inv.membership.code}: {inv.membership.plan.name}, {fmtDate(inv.membership.startDate)} to {fmtDate(inv.membership.endDate)}
              {inv.membership.status === "CANCELLED" && " (cancelled)"}
            </p>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          {!cancelled && inv.balance > 0 && u.can("payments.collect") && (
            <Card title="Collect payment" className="scroll-mt-24" id="collect">
              <CollectForm invoiceId={inv.id} balance={inv.balance} today={todayIso()} />
            </Card>
          )}
          <Card title="Payments">
            {inv.payments.length === 0 ? (
              <p className="text-sm text-muted">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-semibold">{formatInr(p.amount)}</span> · {p.method}
                      </span>
                      {p.status === "REVERSED" ? <Badge tone="alert">Reversed</Badge> : <Badge tone="ok">Received</Badge>}
                    </div>
                    <div className="text-muted">
                      {p.code} · {fmtDate(p.date)} · {inv.staffName(p.receivedById)}
                      {p.txnRef ? ` · Ref ${p.txnRef}` : ""}
                    </div>
                    {p.status === "REVERSED" && <div className="text-muted">Reason: {p.reverseReason}</div>}
                    {p.status === "SUCCESS" && !cancelled && u.can("payments.reverse") && <ReversePayment paymentId={p.id} invoiceId={inv.id} />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {!cancelled && u.can("invoices.cancel") && (
            <Card>
              <CancelInvoice invoiceId={inv.id} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
