import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/current";
import { getAsset } from "@/lib/services/assets";
import { fyLabel } from "@/lib/domain/assets";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { fmtDate, fmtStamp, formatInr } from "@/lib/format";
import { todayIso, toIso } from "@/lib/services/time";
import { DisposeForm, UndoDisposal } from "../asset-forms";
import { ASSET_STATUS, ASSET_TONE } from "../tone";

export const metadata = { title: "Asset · Fitron" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value || "—"}</dd>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fym = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export default async function AssetPage({ params }: PageProps<"/assets/[id]">) {
  const u = await requirePermission("assets.manage");
  const { id } = await params;
  const a = await getAsset(u, id);
  if (!a) notFound();
  const inUse = a.status === "IN_USE";
  const recent = a.info.sch.slice(-12).reverse();
  return (
    <>
      <PageHeader
        title={`${a.name}${a.qty > 1 ? ` ×${a.qty}` : ""}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={ASSET_TONE[a.status]}>{ASSET_STATUS[a.status]}</Badge>
            {a.code} · {a.category} · book value {formatInr(a.info.nbv)}
          </span>
        }
        actions={inUse ? <LinkButton href={`/assets/${a.id}/edit`}>Edit</LinkButton> : <UndoDisposal id={a.id} />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Details">
          <dl className="divide-y divide-line text-sm">
            <Row label="Purchased" value={fmtDate(a.purchaseDate)} />
            <Row label="Cost incl. GST" value={formatInr(a.cost)} />
            <Row label="Salvage value" value={formatInr(a.salvage)} />
            <Row label="Method" value={a.method === "SLM" ? `Straight line over ${a.life} years` : `Written-down value at ${Number(a.rate)}% a year`} />
            {a.accDepCarried > 0 && <Row label="Depreciation before Fitron" value={`${formatInr(a.accDepCarried)} (continues from ${fym(a.depFrom ?? toIso(a.purchaseDate).slice(0, 7))})`} />}
            <Row label="Depreciation to date" value={formatInr(a.info.acc)} />
            <Row label="Book value" value={formatInr(a.info.nbv)} />
            <Row
              label="Paid"
              value={
                a.purchase ? (
                  <Link href={`/purchases/${a.purchase.id}`} className="text-accent">
                    Purchase {a.purchase.code}
                  </Link>
                ) : a.expense ? (
                  `${a.expense.method} · ${a.expense.code}`
                ) : (
                  "Not from the gym's books"
                )
              }
            />
            <Row label="Supplier" value={a.vendor} />
            <Row label="Bill no." value={a.billNo} />
            <Row label="Serial no." value={a.serial} />
            {u.branchIds.length > 1 && <Row label="Branch" value={a.branch.name} />}
            <Row label="Added" value={fmtStamp(a.createdAt)} />
            {a.notes && <Row label="Notes" value={<span className="whitespace-pre-line">{a.notes}</span>} />}
          </dl>
        </Card>
        <div className="flex flex-col gap-6">
          {!inUse && (
            <Card title={a.status === "SOLD" ? "Sold" : "Scrapped"}>
              <dl className="divide-y divide-line text-sm">
                <Row label="Date" value={fmtDate(a.disposedOn)} />
                {a.status === "SOLD" && <Row label="Received" value={`${formatInr(a.disposedFor ?? 0)}${a.disposeMethod ? ` · ${a.disposeMethod}` : ""}`} />}
                <Row label="Book value then" value={formatInr(a.info.nbv)} />
                <Row label={a.info.gain >= 0 ? "Gain on sale" : "Loss on disposal"} value={<span className={a.info.gain >= 0 ? "text-ok" : "text-alert"}>{formatInr(Math.abs(a.info.gain))}</span>} />
                <Row label="Note" value={a.disposeNote} />
              </dl>
            </Card>
          )}
          <Card title="By financial year">
            {a.byFy.length === 0 ? (
              <p className="text-sm text-muted">Depreciation starts in the purchase month.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1 font-medium">Year</th>
                    <th className="py-1 text-right font-medium">Opening</th>
                    <th className="py-1 text-right font-medium">Charge</th>
                    <th className="py-1 text-right font-medium">Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {a.byFy.map((r) => (
                    <tr key={r.fy}>
                      <td className="py-1.5">{fyLabel(r.fy)}</td>
                      <td className="py-1.5 text-right">{formatInr(r.opening)}</td>
                      <td className="py-1.5 text-right">{formatInr(r.dep)}</td>
                      <td className="py-1.5 text-right">{formatInr(r.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card title="Last 12 months">
            {recent.length === 0 ? (
              <p className="text-sm text-muted">Nothing charged yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm tabular-nums">
                {recent.map((r) => (
                  <li key={r.ym} className="flex justify-between py-1.5">
                    <span>{fym(r.ym)}</span>
                    <span>
                      {formatInr(r.dep)} <span className="text-muted">→ {formatInr(r.nbv)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {inUse && (
            <Card title="Sold or scrapped?">
              <DisposeForm id={a.id} today={todayIso()} minDate={toIso(a.purchaseDate)} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
