import Link from "next/link";
import { CaretLeftIcon, CaretRightIcon, ChecksIcon, PencilSimpleIcon, PlusIcon, WhatsappLogoIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import { requirePermission } from "@/lib/auth/current";
import { addDays } from "@/lib/domain/dates";
import { getSession, weekSchedule, weekStart, weekdayOf } from "@/lib/services/classes";
import { memberOptions } from "@/lib/services/members";
import { istClock, todayIso } from "@/lib/services/time";
import { Button, LinkButton, Notice, Segmented, TABLE, TD, TH, TR, cx } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { Tag } from "@/components/tag";
import { fmtClock, fmtDate, initials } from "@/lib/format";
import { BookForm } from "./class-forms";
import { bookingStatusAction, markAllAttendedAction, remindClassAction, toggleClass } from "./actions";

export const metadata = { title: "Classes · Fitron" };

const DAY = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const tone = (n: number, cap: number): "alert" | "warm" | "ok" => (n >= cap ? "alert" : cap && n / cap >= 0.7 ? "warm" : "ok");
const TONE_TEXT = { alert: "text-alert-700", warm: "text-accent-700", ok: "text-accent" };
const TONE_BG = { alert: "bg-alert-700", warm: "bg-accent-700", ok: "bg-accent" };

export default async function ClassesPage({ searchParams }: PageProps<"/classes">) {
  const u = await requirePermission("classes.manage");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = todayIso();
  const thisWeek = weekStart(today);
  const start = isDate(s("week")) ? weekStart(s("week")!) : thisWeek;
  const view = s("view") === "list" ? "list" : "week";
  const sessions = await weekSchedule(u, start);
  const link = (p: Record<string, string | undefined>) => {
    const all = { week: start === thisWeek ? undefined : start, view: view === "week" ? undefined : view, ...p };
    const qs = new URLSearchParams(Object.entries(all).filter(([, v]) => v) as [string, string][]).toString();
    return `/classes${qs ? `?${qs}` : ""}`;
  };

  // The session picked from the timetable (its date defaults to this week's).
  const selId = s("sel");
  const selSlot = selId ? sessions.find((x) => x.id === selId) : undefined;
  const selDate = selId ? (isDate(s("date")) ? s("date")! : selSlot?.date) : undefined;
  const [sel, members] = selId && selDate ? await Promise.all([getSession(u, selId, selDate), memberOptions(u)]) : [null, []];

  const booked = sessions.reduce((a, x) => a + x.booked, 0);
  const places = sessions.reduce((a, x) => a + x.capacity, 0);
  const waiting = sessions.reduce((a, x) => a + x.waitlist, 0);
  const done = sessions.reduce((a, x) => a + x.attended + x.noShow, 0);
  const noShow = sessions.reduce((a, x) => a + x.noShow, 0);
  const todays = sessions.filter((x) => x.date === today);
  const nowHm = istClock();
  const next = todays.find((x) => x.startTime >= nowHm);
  const kpis = [
    ["Classes this week", String(sessions.length), `${new Set(sessions.map((x) => x.trainerId)).size} trainers`],
    ["Booked", String(booked), `of ${places} places`],
    ["Fill rate", places ? `${Math.round((booked / places) * 100)}%` : "—", waiting ? `${waiting} on waitlists` : "no waitlists"],
    ["No-show rate", done ? `${Math.round((noShow / done) * 100)}%` : "—", `${done} completed bookings`],
    ["Today", String(todays.length), next ? `next ${fmtClock(next.startTime)} ${next.name}` : "no more classes today"],
  ];
  const card = (x: (typeof sessions)[number]) => {
    const t = tone(x.booked, x.capacity);
    const on = sel?.slot.id === x.id && sel.date === x.date;
    return { t, on, href: `${link({ sel: x.id, date: x.date })}#session`, past: x.date < today, full: x.booked >= x.capacity };
  };

  return (
    <div className="flex flex-col gap-[26px] pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] tracking-[0.1em] text-muted uppercase">
            Group classes · {fmtDate(start)} – {fmtDate(addDays(start, 6))}
          </div>
          <h1 className="mt-1 text-[28px] lg:text-[40px]">Classes</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-line">
            <Link href={link({ week: addDays(start, -7) })} aria-label="Previous week" className="grid size-9 place-items-center text-accent hover:bg-accent/10">
              <CaretLeftIcon size={16} weight="duotone" />
            </Link>
            <Link href={link({ week: undefined })} className="grid h-9 place-items-center px-2 text-[13px] font-semibold text-accent hover:bg-accent/10">
              This week
            </Link>
            <Link href={link({ week: addDays(start, 7) })} aria-label="Next week" className="grid size-9 place-items-center text-accent hover:bg-accent/10">
              <CaretRightIcon size={16} weight="duotone" />
            </Link>
          </div>
          <Segmented
            options={[
              { key: "week", label: "Week", href: link({ view: undefined }) },
              { key: "list", label: "List", href: link({ view: "list" }) },
            ]}
            current={view}
          />
          <LinkButton href="/classes/new" variant="primary">
            <PlusIcon size={16} weight="duotone" />
            New class
          </LinkButton>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-x-8 gap-y-[22px]">
        {kpis.map(([k, v, sub]) => (
          <div key={k}>
            <div className="text-[11px] tracking-[0.08em] text-muted uppercase">{k}</div>
            <div className="mt-1 text-[28px] leading-[1.15] font-semibold">{v}</div>
            <div className="mt-0.5 text-[12.5px] text-muted">{sub}</div>
          </div>
        ))}
      </div>

      {view === "week" ? (
        <div className="overflow-x-auto pb-1.5">
          <div className="grid min-w-[1080px] grid-cols-[repeat(7,minmax(150px,1fr))] gap-2.5">
            {DAY.map((label, i) => {
              const date = addDays(start, i);
              const items = sessions.filter((x) => x.weekday === i);
              return (
                <div key={label} className="flex min-w-0 flex-col gap-2 rounded-lg bg-surface p-2.5">
                  <div className="flex items-center justify-between gap-1.5 px-0.5 pt-0.5 pb-1.5">
                    <span className="flex items-center gap-2">
                      <span className={cx("grid size-[30px] place-items-center rounded-full text-[13px] font-bold", date === today ? "bg-accent text-accent-ink" : "")}>{Number(date.slice(8))}</span>
                      <span className="text-[13px] font-semibold tracking-[0.04em]">{label}</span>
                    </span>
                    <span className="text-[11px] text-muted">{items.length ? `${items.length} class${items.length > 1 ? "es" : ""}` : "—"}</span>
                  </div>
                  {items.map((x) => {
                    const c = card(x);
                    return (
                      <Link key={x.id} href={c.href} className={cx("flex flex-col gap-2 rounded-lg border px-3 pt-3 pb-2.5 hover:border-accent", c.on ? "border-accent bg-accent-soft" : "border-line bg-bg", c.past && "opacity-65")}>
                        <span className="flex items-center justify-between gap-1.5">
                          <span className="text-[12.5px] font-semibold text-accent-700">{fmtClock(x.startTime)}</span>
                          <span className="text-[11px] text-muted">{x.durationMin} min</span>
                        </span>
                        <span className="text-[15px] leading-tight font-semibold">{x.name}</span>
                        <span className="flex items-center gap-1.5 text-xs text-muted">
                          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-neutral-200 text-[9.5px] font-bold text-neutral-800">{initials(x.trainerName)}</span>
                          <span className="truncate">{x.trainerName}</span>
                        </span>
                        <span className="flex flex-col gap-1">
                          <span className="flex justify-between text-[11.5px]">
                            <span className={cx("font-semibold", TONE_TEXT[c.t])}>
                              {x.booked}/{x.capacity}
                            </span>
                            {c.full && !c.past && <span className="font-semibold text-alert-700">Full</span>}
                            {x.waitlist > 0 && <span className="text-muted">{x.waitlist} waiting</span>}
                          </span>
                          <span className="block h-1 rounded-sm bg-fg/15">
                            <span className={cx("block h-full rounded-sm", TONE_BG[c.t])} style={{ width: `${Math.min(100, (x.booked / x.capacity) * 100)}%` }} />
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                  {items.length === 0 && <div className="rounded-md border border-dashed border-fg/25 px-1.5 py-4 text-center text-xs text-muted">Rest day</div>}
                </div>
              );
            })}
          </div>
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-sm text-muted">No classes scheduled yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className={cx(TABLE, "min-w-[860px]")}>
            <thead>
              <tr>
                {["Day", "Time", "Class", "Trainer", "Room", "Booked", "Fill", ""].map((h, i) => (
                  <th key={i} className={cx(TH, h === "Fill" && "min-w-[140px]")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((x) => {
                const c = card(x);
                return (
                  <tr key={x.id} className={cx(TR, c.on && "bg-accent-soft")}>
                    <td className={cx(TD, "whitespace-nowrap")}>
                      <Link href={c.href} className="hover:text-accent">
                        {DAY[x.weekday]} {Number(x.date.slice(8))}
                      </Link>
                    </td>
                    <td className={cx(TD, "whitespace-nowrap")}>
                      {fmtClock(x.startTime)} · {x.durationMin} min
                    </td>
                    <td className={cx(TD, "font-semibold")}>
                      <Link href={c.href} className="hover:text-accent">
                        {x.name}
                      </Link>
                    </td>
                    <td className={cx(TD, "whitespace-nowrap")}>{x.trainerName}</td>
                    <td className={TD}>{x.room}</td>
                    <td className={cx(TD, "font-semibold whitespace-nowrap", TONE_TEXT[c.t])}>
                      {x.booked}/{x.capacity}
                      {x.waitlist > 0 && <span className="font-normal text-muted"> · {x.waitlist} waiting</span>}
                    </td>
                    <td className={TD}>
                      <span className="block h-1.5 rounded-[3px] bg-fg/15">
                        <span className={cx("block h-full rounded-[3px]", TONE_BG[c.t])} style={{ width: `${Math.min(100, (x.booked / x.capacity) * 100)}%` }} />
                      </span>
                    </td>
                    <td className={cx(TD, "text-right")}>{c.full && <Tag label="Full" />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sel && (
        <section id="session" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-x-12 gap-y-6 rounded-xl border border-line bg-surface p-[22px]">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] tracking-[0.1em] text-muted uppercase">
                  {DAY[weekdayOf(sel.date)]}, {fmtDate(sel.date)} · {fmtClock(sel.slot.startTime)} · {sel.slot.durationMin} min
                </div>
                <h2 className="mt-1 text-[26px]">{sel.slot.name}</h2>
                <div className="mt-1.5 flex items-center gap-2 text-[13.5px] text-muted">
                  <span className="grid size-6 place-items-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-800">{initials(sel.trainerName)}</span>
                  {[sel.trainerName, sel.slot.room, u.branchIds.length > 1 ? sel.slot.branch.name : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              <Link href={link({})} aria-label="Close" className="grid size-9 place-items-center rounded-md text-accent hover:bg-accent/10">
                <XIcon size={18} weight="duotone" />
              </Link>
            </div>
            {s("msg") && <Notice tone="ok">{s("msg")}</Notice>}
            {(() => {
              const waitN = sel.bookings.filter((b) => b.status === "Waitlist").length;
              const att = sel.bookings.filter((b) => b.status === "Attended").length;
              const ns = sel.bookings.filter((b) => b.status === "No-show").length;
              const t = tone(sel.held, sel.slot.capacity);
              return (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[13.5px]">
                    <span className={cx("font-semibold", TONE_TEXT[t])}>
                      {sel.held} of {sel.slot.capacity} places booked{waitN ? ` · ${waitN} on waitlist` : ""}
                    </span>
                    {sel.date <= today && (
                      <span className="text-muted">
                        {att} attended · {ns} no-show
                      </span>
                    )}
                  </div>
                  <div className="h-2 rounded bg-fg/15">
                    <div className={cx("h-full rounded", TONE_BG[t])} style={{ width: `${Math.min(100, (sel.held / sel.slot.capacity) * 100)}%` }} />
                  </div>
                </div>
              );
            })()}
            {sel.date >= today && sel.slot.active && <BookForm slotId={sel.slot.id} date={sel.date} members={members} full={sel.held >= sel.slot.capacity} />}
            <div className="flex flex-wrap gap-2">
              {u.can("whatsapp.send") && sel.date >= today && sel.bookings.some((b) => b.status === "Booked") && (
                <form action={remindClassAction.bind(null, sel.slot.id, sel.date)}>
                  <Button>
                    <WhatsappLogoIcon size={16} weight="duotone" />
                    Remind everyone
                  </Button>
                </form>
              )}
              {sel.date <= today && sel.bookings.some((b) => b.status === "Booked") && (
                <form action={markAllAttendedAction.bind(null, sel.slot.id, sel.date)}>
                  <Button>
                    <ChecksIcon size={16} weight="duotone" />
                    Mark all attended
                  </Button>
                </form>
              )}
              <LinkButton href={`/classes/${sel.slot.id}/edit`} variant="ghost">
                <PencilSimpleIcon size={16} weight="duotone" />
                Edit class
              </LinkButton>
              <form action={toggleClass.bind(null, sel.slot.id, !sel.slot.active)}>
                <ConfirmButton variant="ghost" confirm={sel.slot.active ? "Stop running this class? Existing bookings stay on record." : "Run this class again?"}>
                  {sel.slot.active ? "Stop class" : "Restart class"}
                </ConfirmButton>
              </form>
            </div>
            <p className="m-0 text-[12.5px] leading-relaxed text-muted">When a booked member cancels, the first person on the waitlist is moved in.</p>
          </div>
          <div className="flex flex-col gap-2.5">
            <h3 className="text-[17px]">Roster</h3>
            {sel.bookings.filter((b) => b.status !== "Cancelled").length === 0 ? (
              <p className="m-0 text-sm text-muted">No bookings yet. Pick a member on the left to book the first place.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={TABLE}>
                  <thead>
                    <tr>
                      {["#", "Member", "Status", ""].map((h, i) => (
                        <th key={i} className={TH}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sel.bookings
                      .filter((b) => b.status !== "Cancelled")
                      .sort((a, b) => (a.status === "Waitlist" ? 1 : 0) - (b.status === "Waitlist" ? 1 : 0))
                      .map((b, i) => (
                        <tr key={b.id} className={TR}>
                          <td className={cx(TD, "text-muted")}>{i + 1}</td>
                          <td className={cx(TD, "whitespace-nowrap")}>
                            <Link href={`/members/${b.member.id}`} className="flex items-center gap-2.5 hover:text-accent">
                              <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-accent-soft text-[11.5px] font-bold text-accent-strong">{initials(b.member.name)}</span>
                              <span>
                                <span className="block font-semibold">{b.member.name}</span>
                                <span className="block text-xs text-muted">
                                  {b.member.code} · {b.member.phone}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className={TD}>
                            <Tag label={b.status} />
                          </td>
                          <td className={cx(TD, "text-right whitespace-nowrap")}>
                            <span className="inline-flex gap-1">
                              {sel.date <= today && b.status === "Booked" && (
                                <>
                                  <form action={bookingStatusAction.bind(null, b.id, sel.slot.id, "Attended")}>
                                    <Button variant="ghost" className="text-[13px]">
                                      Attended
                                    </Button>
                                  </form>
                                  <form action={bookingStatusAction.bind(null, b.id, sel.slot.id, "No-show")}>
                                    <Button variant="ghost" className="text-[13px]">
                                      No-show
                                    </Button>
                                  </form>
                                </>
                              )}
                              {(b.status === "Attended" || b.status === "No-show") && (
                                <form action={bookingStatusAction.bind(null, b.id, sel.slot.id, "Booked")}>
                                  <Button variant="ghost" className="text-[13px]">
                                    Undo
                                  </Button>
                                </form>
                              )}
                              {sel.date >= today && (b.status === "Booked" || b.status === "Waitlist") && (
                                <form action={bookingStatusAction.bind(null, b.id, sel.slot.id, "Cancelled")}>
                                  <ConfirmButton variant="ghost" className="text-[13px] text-alert-700" confirm={`Cancel ${b.member.name}'s ${b.status === "Waitlist" ? "waitlist place" : "booking"}?`}>
                                    Cancel
                                  </ConfirmButton>
                                </form>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
