import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { listAssets } from "@/lib/services/assets";
import { ASSET_CATEGORIES, fyLabel, fyOf } from "@/lib/domain/assets";
import { Badge, Button, Empty, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { fmtDate, formatInr } from "@/lib/format";
import { todayIso } from "@/lib/services/time";
import { ASSET_STATUS, ASSET_TONE } from "./tone";

export const metadata = { title: "Fixed assets · Fitron" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function AssetsPage({ searchParams }: PageProps<"/assets">) {
  const u = await requirePermission("assets.manage");
  const sp = await searchParams;
  const f = { q: one(sp.q), status: one(sp.status) ?? "IN_USE", category: one(sp.category) };
  const rows = await listAssets(u, { ...f, status: f.status === "all" ? undefined : f.status });
  const cost = rows.reduce((s, a) => s + a.cost, 0);
  const nbv = rows.reduce((s, a) => s + (a.status === "IN_USE" ? a.info.nbv : 0), 0);
  const fyDep = rows.reduce((s, a) => s + a.info.fyDep, 0);
  const fy = fyLabel(fyOf(todayIso().slice(0, 7)));
  return (
    <>
      <PageHeader
        title="Fixed assets"
        subtitle={`${rows.length} asset${rows.length === 1 ? "" : "s"} · cost ${formatInr(cost)} · book value ${formatInr(nbv)} · depreciation ${fy} ${formatInr(fyDep)}`}
        actions={
          <>
            <LinkButton href="/purchases/new">Record a bill</LinkButton>
            <LinkButton href="/assets/new" variant="primary">
              Add asset
            </LinkButton>
          </>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input name="q" defaultValue={f.q ?? ""} placeholder="Name, ID, supplier or serial" aria-label="Search assets" className="min-w-48 flex-1" />
        <Select name="category" defaultValue={f.category ?? ""} aria-label="Category" className="w-auto!">
          <option value="">All categories</option>
          {ASSET_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select name="status" defaultValue={f.status} aria-label="Status" className="w-auto!">
          <option value="IN_USE">In use</option>
          <option value="SOLD">Sold</option>
          <option value="SCRAPPED">Scrapped</option>
          <option value="all">All</option>
        </Select>
        <Button>Filter</Button>
      </form>
      {rows.length === 0 ? (
        <Empty>No assets here yet. Add gym equipment, ACs, computers and furniture so depreciation is charged each month.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2 font-medium">Asset</th>
                <th className="px-4 py-2 font-medium">Purchased</th>
                <th className="px-4 py-2 font-medium">Method</th>
                <th className="px-4 py-2 text-right font-medium">Cost</th>
                <th className="px-4 py-2 text-right font-medium">Depreciation</th>
                <th className="px-4 py-2 text-right font-medium">Book value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/assets/${a.id}`} className="font-semibold hover:text-accent">
                      {a.name}
                      {a.qty > 1 ? ` ×${a.qty}` : ""}
                    </Link>
                    <span className="block text-xs text-muted">
                      {a.code} · {a.category}
                      {u.branchIds.length > 1 ? ` · ${a.branch.name}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{fmtDate(a.purchaseDate)}</td>
                  <td className="px-4 py-2.5">{a.method === "SLM" ? `SLM ${a.life} yrs` : `WDV ${Number(a.rate)}%`}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatInr(a.cost)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatInr(a.info.acc)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {a.status === "IN_USE" ? formatInr(a.info.nbv) : <Badge tone={ASSET_TONE[a.status]}>{ASSET_STATUS[a.status]}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
