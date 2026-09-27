import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { addDays } from "@/lib/domain/dates";
import { weekSchedule, weekStart, WEEKDAYS } from "@/lib/services/classes";
import { todayIso } from "@/lib/services/time";
import { Badge, Empty, LinkButton, PageHeader, cx } from "@/components/ui";
import { fmtClock, fmtDate } from "@/lib/format";

export const metadata = { title: "Classes · Fitron" };

export default async function ClassesPage({ searchParams }: PageProps<"/classes">) {
  const u = await requirePermission("classes.manage");
  const { week } = await searchParams;
  const today = todayIso();
  const start = weekStart(typeof week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const sessions = await weekSchedule(u, start);
  const booked = sessions.reduce((a, s) => a + s.booked, 0);
  const places = sessions.reduce((a, s) => a + s.capacity, 0);

  return (
    <>
      <PageHeader
        title="Classes"
        subtitle={`Week of ${fmtDate(start)} · ${booked} of ${places} places booked`}
        actions={
          <>
            <LinkButton href={`/classes?week=${addDays(start, -7)}`}>← Previous</LinkButton>
            {start !== weekStart(today) && <LinkButton href="/classes">This week</LinkButton>}
            <LinkButton href={`/classes?week=${addDays(start, 7)}`}>Next →</LinkButton>
            <LinkButton href="/classes/new" variant="primary">
              Add class
            </LinkButton>
          </>
        }
      />
      {sessions.length === 0 ? (
        <Empty>No classes yet. Add one to build the weekly timetable.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {WEEKDAYS.map((name, i) => {
            const date = addDays(start, i);
            const list = sessions.filter((s) => s.weekday === i);
            if (!list.length) return null;
            return (
              <section key={name} className={cx("rounded-xl border bg-surface p-4", date === today ? "border-accent" : "border-line")}>
                <h2 className="mb-3 font-semibold">
                  {name} <span className="font-normal text-muted">{fmtDate(date)}</span>
                </h2>
                <ul className="flex flex-col gap-2">
                  {list.map((s) => {
                    const full = s.booked >= s.capacity;
                    return (
                      <li key={s.id}>
                        <Link href={`/classes/${s.id}?date=${date}`} className="block rounded-lg border border-line p-3 hover:border-accent">
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{s.name}</span>
                            {full ? <Badge tone="alert">Full</Badge> : <Badge>{s.capacity - s.booked} left</Badge>}
                          </span>
                          <span className="text-sm text-muted">
                            {fmtClock(s.startTime)} · {s.durationMin} min · {s.trainerName}
                            {u.branchIds.length > 1 ? ` · ${s.branch.name}` : ""}
                          </span>
                          <span className="mt-2 block h-1.5 overflow-hidden rounded bg-surface-2">
                            <span className="block h-full bg-accent" style={{ width: `${Math.min(100, (s.booked / s.capacity) * 100)}%` }} />
                          </span>
                          <span className="mt-1 block text-xs text-muted">
                            {s.booked}/{s.capacity} booked{s.waitlist ? ` · ${s.waitlist} waiting` : ""}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
