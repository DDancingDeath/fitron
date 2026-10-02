import { FileCsvIcon, PrinterIcon } from "@phosphor-icons/react/dist/ssr";
import { requirePermission } from "@/lib/auth/current";
import { REPORTS, reportList } from "@/lib/services/reports";
import { monthPeriod } from "@/lib/services/accounting";
import { todayIso } from "@/lib/services/time";
import { AutoFilter } from "@/components/auto-filter";
import { Input, Select } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { fmtDate } from "@/lib/format";
import { ReportNav, ReportTable } from "./report-view";

export const metadata = { title: "Reports · Fitron" };

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const u = await requirePermission("invoices.view");
  const sp = await searchParams;
  const list = reportList(u);
  const key = list.some((r) => r.key === sp.r) ? (sp.r as string) : list[0]!.key;
  const def = REPORTS[key]!;
  const today = todayIso();
  const period = { from: isDate(sp.from) ? sp.from : monthPeriod(today.slice(0, 7)).from, to: isDate(sp.to) ? sp.to : today };
  const r = await def.run(u, period);
  const groups = [...new Set(list.map((x) => x.group))].map((g) => ({ title: g, items: list.filter((x) => x.group === g).map((x) => ({ key: x.key, title: x.title })) }));
  const keepPeriod = isDate(sp.from) || isDate(sp.to) ? `&from=${period.from}&to=${period.to}` : "";
  const branch = u.branch === "ALL" ? "All branches" : (u.branches.find((b) => b.id === u.branch)?.name ?? "");

  return (
    <div className="flex flex-col gap-6 pt-4">
      <div className="print:hidden">
        <div className="text-xs tracking-[0.04em] text-muted uppercase">Report center</div>
        <h1 className="mt-1 text-[28px] lg:text-[40px]">Reports</h1>
        <div className="mt-1 text-sm text-muted">Every figure comes from invoices, payments and expenses, never typed totals.</div>
      </div>
      <div className="flex items-start gap-6">
        <div className="hidden lg:block print:hidden">
          <ReportNav groups={groups} current={key} qs={keepPeriod} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <AutoFilter className="lg:hidden print:hidden">
            {keepPeriod && (
              <>
                <input type="hidden" name="from" value={period.from} />
                <input type="hidden" name="to" value={period.to} />
              </>
            )}
            <Select name="r" defaultValue={key} aria-label="Report">
              {list.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.group} · {x.title}
                </option>
              ))}
            </Select>
          </AutoFilter>
          <section className="overflow-hidden rounded-lg bg-surface">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-[18px]">
              <div>
                <h2 className="m-0 text-2xl">{def.title}</h2>
                <div className="mt-0.5 text-[13px] text-muted">
                  {def.usesPeriod ? `${fmtDate(period.from)} – ${fmtDate(period.to)} · ` : ""}
                  {branch}
                </div>
              </div>
              <div className="inline-flex overflow-hidden rounded-md border border-line print:hidden">
                <a href={`/reports/${key}/csv?from=${period.from}&to=${period.to}`} className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] hover:bg-accent-soft">
                  <FileCsvIcon size={16} weight="duotone" />
                  CSV
                </a>
                <span className="border-l border-line [&_button]:min-h-0 [&_button]:rounded-none [&_button]:border-0 [&_button]:px-3.5 [&_button]:py-2 [&_button]:text-[13px] [&_button]:font-normal">
                  <PrintButton>
                    <PrinterIcon size={16} weight="duotone" />
                    PDF
                  </PrintButton>
                </span>
              </div>
            </div>
            {def.usesPeriod && (
              <AutoFilter className="flex flex-wrap gap-2 px-5 pt-3 print:hidden">
                <input type="hidden" name="r" value={key} />
                <Input name="from" type="date" defaultValue={period.from} max={today} aria-label="From" className="w-auto!" />
                <Input name="to" type="date" defaultValue={period.to} max={today} aria-label="To" className="w-auto!" />
              </AutoFilter>
            )}
            <ReportTable key={`${key}${period.from}${period.to}`} columns={r.columns} rows={r.rows} totals={r.totals} />
          </section>
        </div>
      </div>
    </div>
  );
}
