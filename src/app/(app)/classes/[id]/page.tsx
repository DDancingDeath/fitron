import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/current";
import { addDays } from "@/lib/domain/dates";
import { getSession, getSlot, weekdayOf, WEEKDAYS } from "@/lib/services/classes";
import { memberOptions } from "@/lib/services/members";
import { todayIso } from "@/lib/services/time";
import { Badge, Button, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { fmtClock, fmtDate } from "@/lib/format";
import { BookForm } from "../class-forms";
import { bookingStatusAction, toggleClass } from "../actions";

export const metadata = { title: "Class · Fitron" };

const TONE = { Booked: "accent", Waitlist: "neutral", Attended: "ok", "No-show": "alert", Cancelled: "neutral" } as const;

/** The next date (from today) this weekday falls on. */
const nextOn = (weekday: number, from: string) => addDays(from, (weekday - weekdayOf(from) + 7) % 7);

export default async function ClassSession({ params, searchParams }: PageProps<"/classes/[id]">) {
  const u = await requirePermission("classes.manage");
  const { id } = await params;
  const { date: d } = await searchParams;
  const slot = await getSlot(u, id);
  if (!slot) notFound();
  const today = todayIso();
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && weekdayOf(d) === slot.weekday ? d : nextOn(slot.weekday, today);
  const [s, members] = await Promise.all([getSession(u, id, date), memberOptions(u)]);
  if (!s) notFound();
  const past = date < today;
  const full = s.held >= slot.capacity;
  const active = s.bookings.filter((b) => b.status !== "Cancelled");
  const cancelled = s.bookings.filter((b) => b.status === "Cancelled");

  return (
    <>
      <PageHeader
        title={slot.name}
        subtitle={`${WEEKDAYS[slot.weekday]} ${fmtDate(date)} · ${fmtClock(slot.startTime)} · ${slot.durationMin} min · ${s.trainerName}${slot.room ? ` · ${slot.room}` : ""}`}
        actions={
          <>
            <LinkButton href={`/classes/${id}?date=${addDays(date, -7)}`}>← Week before</LinkButton>
            <LinkButton href={`/classes/${id}?date=${addDays(date, 7)}`}>Week after →</LinkButton>
            <LinkButton href={`/classes/${id}/edit`}>Edit</LinkButton>
            <form action={toggleClass.bind(null, id, !slot.active)}>
              <ConfirmButton confirm={slot.active ? "Stop running this class? Existing bookings stay on record." : "Run this class again?"}>{slot.active ? "Stop class" : "Restart class"}</ConfirmButton>
            </form>
          </>
        }
      />
      {!slot.active && <p className="mb-4 text-alert">This class has been stopped and no longer shows on the timetable.</p>}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title={`Bookings · ${s.held}/${slot.capacity}${full ? " (full)" : ""}`}>
          {active.length === 0 ? (
            <Empty>Nobody booked yet.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {active.map((b, i) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <span className="w-6 text-sm text-muted">{i + 1}</span>
                  <Link href={`/members/${b.member.id}`} className="min-w-0 flex-1 truncate font-semibold hover:text-accent">
                    {b.member.name} <span className="font-normal text-muted">{b.member.code}</span>
                  </Link>
                  <Badge tone={TONE[b.status as keyof typeof TONE] ?? "neutral"}>{b.status}</Badge>
                  {date <= today && b.status === "Booked" && (
                    <>
                      <form action={bookingStatusAction.bind(null, b.id, id, "Attended")}>
                        <Button>Attended</Button>
                      </form>
                      <form action={bookingStatusAction.bind(null, b.id, id, "No-show")}>
                        <Button variant="ghost">No-show</Button>
                      </form>
                    </>
                  )}
                  {(b.status === "Attended" || b.status === "No-show") && (
                    <form action={bookingStatusAction.bind(null, b.id, id, "Booked")}>
                      <Button variant="ghost">Undo</Button>
                    </form>
                  )}
                  {!past && (b.status === "Booked" || b.status === "Waitlist") && (
                    <form action={bookingStatusAction.bind(null, b.id, id, "Cancelled")}>
                      <ConfirmButton variant="ghost" confirm={`Cancel ${b.member.name}'s ${b.status === "Waitlist" ? "waitlist place" : "booking"}?${b.status === "Booked" ? " The first person waiting moves in." : ""}`}>
                        Cancel
                      </ConfirmButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {cancelled.length > 0 && <p className="mt-3 text-sm text-muted">Cancelled: {cancelled.map((b) => b.member.name).join(", ")}</p>}
        </Card>
        {!past && slot.active && (
          <Card title={full ? "Class is full" : "Book a member"}>
            <BookForm slotId={id} date={date} members={members} full={full} />
            {full && <p className="mt-2 text-sm text-muted">New bookings join the waitlist. When someone cancels, the first person waiting moves in.</p>}
          </Card>
        )}
      </div>
    </>
  );
}
