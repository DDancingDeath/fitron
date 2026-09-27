import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { REPORTS } from "@/lib/services/reports";
import { monthPeriod } from "@/lib/services/accounting";
import { todayIso } from "@/lib/services/time";
import { Button, Empty, Input, LinkButton, PageHeader } from "@/components/ui";
import { formatInr } from "@/lib/format";

export const metadata = { title: "Report · Fitron" };

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[key]">) {
  const u = await requireUser();
  const { key } = await params;
  const def = REPORTS[key];
  if (!def) notFound();
  if (!u.can(def.perm)) redirect("/dashboard?denied=1");
  const sp = await searchParams;
  const today = todayIso();
  const period = { from: typeof sp.from === "string" ? sp.from : monthPeriod(today.slice(0, 7)).from, to: typeof sp.to === "string" ? sp.to : today };
  const r = await def.run(u, period);
  const qs = new URLSearchParams(period).toString();

  return (
    <>
      <PageHeader title={def.title} subtitle={`${r.rows.length} rows`} actions={<LinkButton href={`/reports/${key}/csv?${qs}`} prefetch={false}>Download CSV</LinkButton>} />
      {def.usesPeriod && (
        <form className="mb-4 flex flex-wrap gap-2">
          <Input name="from" type="date" defaultValue={period.from} aria-label="From" className="w-auto!" />
          <Input name="to" type="date" defaultValue={period.to} aria-label="To" className="w-auto!" />
          <Button>Show</Button>
        </form>
      )}
      {r.rows.length === 0 ? (
        <Empty>Nothing to show for this period.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                {r.columns.map((c) => (
                  <th key={c.key} className={c.money ? "px-3 py-2 text-right font-normal whitespace-nowrap" : "px-3 py-2 font-normal whitespace-nowrap"}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.rows.map((row, i) => (
                <tr key={i}>
                  {r.columns.map((c) => (
                    <td key={c.key} className={c.money ? "px-3 py-2 text-right whitespace-nowrap" : "px-3 py-2"}>
                      {c.money && typeof row[c.key] === "number" ? formatInr(row[c.key] as number) : (row[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {r.totals && (
              <tfoot>
                <tr className="border-t border-line font-semibold">
                  {r.columns.map((c, i) => (
                    <td key={c.key} className={c.money ? "px-3 py-2 text-right whitespace-nowrap" : "px-3 py-2"}>
                      {i === 0 ? "Total" : r.totals![c.key] == null ? "" : c.money ? formatInr(r.totals![c.key] as number) : r.totals![c.key]}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </>
  );
}
