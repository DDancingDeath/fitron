import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { listMembers } from "@/lib/services/members";
import { todayIso } from "@/lib/services/time";
import { daysBetween } from "@/lib/domain/dates";
import { Empty, LinkButton, PageHeader, cx } from "@/components/ui";
import { MemberStatus } from "@/components/status";
import { fmtDate, formatInr } from "@/lib/format";

export const metadata = { title: "Renewals · Fitron" };

const WINDOWS = [
  ["7", "Next 7 days"],
  ["15", "Next 15 days"],
  ["30", "Next 30 days"],
  ["lapsed", "Lapsed in last 30 days"],
] as const;

export default async function RenewalsPage({ searchParams }: PageProps<"/renewals">) {
  const u = await requirePermission("memberships.renew");
  const { w } = await searchParams;
  const win = typeof w === "string" && WINDOWS.some(([k]) => k === w) ? w : "15";
  const today = todayIso();
  const { rows } = await listMembers(u, { all: true });
  const list = rows
    .filter((r) => r.latestEnd && r.status !== "SUSPENDED")
    .map((r) => ({ ...r, days: daysBetween(r.latestEnd!, today) }))
    .filter((r) => (win === "lapsed" ? r.days < 0 && r.days >= -30 : r.days >= 0 && r.days <= Number(win)))
    .sort((a, b) => a.days - b.days);

  return (
    <>
      <PageHeader title="Renewals" subtitle={`${list.length} ${list.length === 1 ? "member" : "members"}`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {WINDOWS.map(([k, label]) => (
          <Link key={k} href={`/renewals?w=${k}`} className={cx("rounded-full border px-3 py-1.5 text-sm", win === k ? "border-accent bg-accent-soft text-accent" : "border-line")}>
            {label}
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty>No one in this window.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {list.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <Link href={`/members/${m.id}`} className="min-w-0 flex-1 hover:text-accent">
                  <span className="block truncate font-semibold">{m.name}</span>
                  <span className="text-sm text-muted">
                    {m.planName} · {m.phone}
                  </span>
                </Link>
                <span className="text-sm">
                  {m.days >= 0 ? `Ends ${fmtDate(m.latestEnd)} · ${m.days === 0 ? "today" : `in ${m.days}d`}` : `Ended ${fmtDate(m.latestEnd)} · ${-m.days}d ago`}
                </span>
                {m.outstanding > 0 && <span className="text-sm font-semibold text-alert">{formatInr(m.outstanding)} due</span>}
                <MemberStatus status={m.status} />
                <LinkButton href={`/members/${m.id}/sell`} variant="primary">
                  Renew
                </LinkButton>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
