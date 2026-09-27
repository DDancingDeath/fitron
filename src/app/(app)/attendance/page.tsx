import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { dailyCounts, findForCheckIn, listDay } from "@/lib/services/attendance";
import { todayIso } from "@/lib/services/time";
import { Badge, Button, Card, Empty, Input, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { MemberStatus } from "@/components/status";
import { fmtDate, fmtTime, formatInr } from "@/lib/format";
import { CheckInButton, GuestForm } from "./attendance-forms";
import { checkOutAction, closeDayAction, removeAction } from "./actions";

export const metadata = { title: "Attendance · Fitron" };

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const u = await requirePermission("attendance.manage");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = todayIso();
  const date = s("date") && s("date")! <= today ? s("date")! : today;
  const q = s("q")?.trim();
  const [hits, day, trend] = await Promise.all([q ? findForCheckIn(u, q) : Promise.resolve([]), listDay(u, date), dailyCounts(u, 14)]);
  const peak = Math.max(1, ...trend.map((t) => t.count));
  const isToday = date === today;

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={`${fmtDate(date)} · ${day.members} members, ${day.guests} guests${isToday ? ` · ${day.inside} inside now` : ""}`}
        actions={
          isToday && day.inside > 0 ? (
            <form action={closeDayAction}>
              <ConfirmButton confirm={`Check out the ${day.inside} people still inside?`}>Close the day</ConfirmButton>
            </form>
          ) : undefined
        }
      />

      {isToday && (
        <Card title="Check in" className="mb-6">
          <form className="flex gap-2">
            <Input name="q" defaultValue={q} placeholder="Member ID, mobile or name" aria-label="Find member" autoFocus autoComplete="off" />
            <Button variant="primary">Find</Button>
          </form>
          {q && (
            <div className="mt-4">
              {hits.length === 0 ? (
                <p className="text-muted">No member matches “{q}”. Try the ID, the mobile number or part of the name.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {hits.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                      <span className="min-w-0 flex-1">
                        <Link href={`/members/${m.id}`} className="block truncate font-semibold hover:text-accent">
                          {m.name}
                        </Link>
                        <span className="text-sm text-muted">
                          {m.code} · {m.phone} · {m.planName ?? "No plan"}
                          {m.latestEnd ? ` · ends ${fmtDate(m.latestEnd)}` : ""}
                          {m.outstanding > 0 ? ` · ${formatInr(m.outstanding)} due` : ""}
                        </span>
                      </span>
                      <MemberStatus status={m.status} />
                      <CheckInButton memberId={m.id} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted">Check in a guest or day-pass visitor</summary>
            <div className="mt-3">
              <GuestForm />
            </div>
          </details>
        </Card>
      )}

      <Card title="Last 14 days" className="mb-6">
        <div className="flex h-24 items-end gap-1" role="img" aria-label="Daily check-ins for the last 14 days">
          {trend.map((t) => (
            <Link key={t.date} href={`/attendance?date=${t.date}`} className="group flex flex-1 flex-col items-center gap-1" title={`${fmtDate(t.date)}: ${t.count}`}>
              <span className="text-[10px] text-muted">{t.count || ""}</span>
              <span className={`w-full rounded-t ${t.date === date ? "bg-accent" : "bg-accent-soft group-hover:bg-accent/60"}`} style={{ height: `${Math.max(4, (t.count / peak) * 64)}px` }} />
            </Link>
          ))}
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{isToday ? "Today" : fmtDate(date)}</h2>
        <form className="flex gap-2">
          <Input name="date" type="date" defaultValue={date} max={today} aria-label="Date" className="w-auto!" />
          <Button>Show</Button>
        </form>
      </div>
      {day.rows.length === 0 ? (
        <Empty>No check-ins on this day.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {day.rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="min-w-0 flex-1">
                  {r.member ? (
                    <Link href={`/members/${r.member.id}`} className="block truncate font-semibold hover:text-accent">
                      {r.member.name}
                    </Link>
                  ) : (
                    <span className="block truncate font-semibold">{r.guestName}</span>
                  )}
                  <span className="text-sm text-muted">
                    {r.member ? r.member.code : `Guest${r.guestPhone ? ` · ${r.guestPhone}` : ""}`} · {r.method}
                    {u.branchIds.length > 1 ? ` · ${r.branch.name}` : ""}
                    {r.override ? ` · allowed: ${r.override}` : ""}
                  </span>
                </span>
                {r.override && <Badge tone="alert">Override</Badge>}
                <span className="text-sm tabular-nums">
                  {fmtTime(r.checkIn)} – {r.checkOut ? `${fmtTime(r.checkOut)}${r.autoOut ? " (auto)" : ""}` : "inside"}
                </span>
                {!r.checkOut && isToday && (
                  <form action={checkOutAction.bind(null, r.id)}>
                    <Button>Check out</Button>
                  </form>
                )}
                {isToday && (
                  <form action={removeAction.bind(null, r.id)}>
                    <ConfirmButton variant="ghost" confirm="Remove this check-in? Use this only for a wrong entry. It's recorded in the audit log.">
                      Remove
                    </ConfirmButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
