import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { listLeads } from "@/lib/services/leads";
import { todayIso, toIso } from "@/lib/services/time";
import { Badge, Button, Empty, Input, LinkButton, PageHeader, cx } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { LEAD_STAGES } from "@/lib/validation/frontdesk";
import { STAGE_TONE } from "./stage-tone";

export const metadata = { title: "Leads · Fitron" };


export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const u = await requirePermission("leads.manage");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const stage = s("stage");
  const due = s("due") === "1";
  const { leads, counts, dueToday } = await listLeads(u, { stage, q: s("q"), due });
  const today = todayIso();
  const open = counts.New + counts.Contacted + counts["Trial booked"] + counts["Trial done"];
  const won = counts.Won;
  const closed = won + counts.Lost;

  const tab = (href: string, label: string, active: boolean) => (
    <Link key={href} href={href} className={cx("rounded-full border px-3 py-1.5 text-sm", active ? "border-accent bg-accent-soft text-accent" : "border-line")}>
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${open} open · ${dueToday} to follow up today${closed ? ` · ${Math.round((won / closed) * 100)}% of closed leads joined` : ""}`}
        actions={<LinkButton href="/leads/new" variant="primary">Add lead</LinkButton>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {tab("/leads", `Open (${open})`, !stage && !due)}
        {tab("/leads?due=1", `Follow up today (${dueToday})`, due)}
        {LEAD_STAGES.map((st) => tab(`/leads?stage=${encodeURIComponent(st)}`, `${st} (${counts[st]})`, stage === st))}
      </div>
      <form className="mb-4 flex gap-2">
        {stage && <input type="hidden" name="stage" value={stage} />}
        <Input name="q" defaultValue={s("q")} placeholder="Name or mobile" aria-label="Search leads" />
        <Button>Search</Button>
      </form>
      {leads.length === 0 ? (
        <Empty>No leads here.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {leads.map((l) => {
              const f = l.followUpOn ? toIso(l.followUpOn) : null;
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <Link href={`/leads/${l.id}`} className="block truncate font-semibold hover:text-accent">
                      {l.name}
                    </Link>
                    <span className="text-sm text-muted">
                      {l.phone} · {l.interest} · {l.source} · {l.ownerName}
                    </span>
                  </span>
                  <Badge tone={STAGE_TONE[l.stage as keyof typeof STAGE_TONE] ?? "neutral"}>{l.stage}</Badge>
                  {f && (
                    <span className={cx("w-32 text-right text-sm", f < today ? "text-alert" : f === today ? "text-accent" : "text-muted")}>
                      {f < today ? "Overdue " : f === today ? "Today" : "Follow up "}
                      {f !== today && fmtDate(f)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
