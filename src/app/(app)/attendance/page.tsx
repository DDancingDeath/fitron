import Link from "next/link";
import { CaretLeftIcon, CaretRightIcon, DoorOpenIcon, DownloadSimpleIcon, FingerprintIcon, SignInIcon, UserCirclePlusIcon, WhatsappLogoIcon } from "@phosphor-icons/react/dist/ssr";
import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { attendanceBoard, dailyCounts, findForCheckIn, getAccessRules } from "@/lib/services/attendance";
import { todayIso } from "@/lib/services/time";
import { addDays } from "@/lib/domain/dates";
import { Button, LinkButton, Notice, Segmented, TABLE, TD, TH, TR, cx } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { Tag } from "@/components/tag";
import { fmtDate, fmtStamp, fmtTime, formatRupees, initials } from "@/lib/format";
import { CheckInButton, GuestForm, QrCheckIn } from "./attendance-forms";
import { checkOutAction, closeDayAction, nudgeAction, removeAction } from "./actions";

export const metadata = { title: "Attendance · Fitron" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${d.getUTCFullYear()}`;
};
const hourLabel = (h: number, short = false) => `${h % 12 || 12}${short ? (h < 12 ? "a" : "p") : h < 12 ? " am" : " pm"}`;
const duration = (n: number) => (n < 60 ? `${n} min` : `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} m` : ""}`);
const METHODS = [
  ["desk", "Front desk"],
  ["qr", "QR code"],
  ["bio", "Biometric"],
] as const;

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const u = await requirePermission("attendance.manage");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = todayIso();
  const date = s("date") && /^\d{4}-\d{2}-\d{2}$/.test(s("date")!) && s("date")! <= today ? s("date")! : today;
  const isToday = date === today;
  const method = METHODS.some(([k]) => k === s("method")) ? s("method")! : "desk";
  const q = s("q")?.trim();
  const [hits, board, trend, rules, devices] = await Promise.all([
    q ? findForCheckIn(u, q) : Promise.resolve([]),
    attendanceBoard(u, date),
    dailyCounts(u, 14),
    getAccessRules(u.orgId),
    method === "bio"
      ? db.device
          .findMany({ where: { orgId: u.orgId, approved: true, branchId: { in: u.branchIds } }, orderBy: { createdAt: "asc" } })
          .then((ds) => ds.map((d) => ({ ...d, online: !!d.lastSeenAt && Date.now() - d.lastSeenAt.getTime() < 5 * 60_000 })))
      : [],
  ]);
  const peak = Math.max(1, ...trend.map((t) => t.count));
  const busiest = board.hours.reduce((p, h) => (h.count > p.count ? h : p), board.hours[0]!);
  const maxHour = Math.max(1, ...board.hours.map((h) => h.count));
  const canRenew = u.can("memberships.renew");
  const canWa = u.can("whatsapp.send");
  const link = (p: Record<string, string | undefined>) => {
    const all = { method: method === "desk" ? undefined : method, date: date === today ? undefined : date, ...p };
    const qs = new URLSearchParams(Object.entries(all).filter(([, v]) => v) as [string, string][]).toString();
    return `/attendance${qs ? `?${qs}` : ""}`;
  };
  const here = link({});
  const rulesText = [
    rules.blockExpired ? `expired blocked after ${rules.graceDays} grace day${rules.graceDays === 1 ? "" : "s"}` : "expired allowed",
    rules.blockDues ? `dues above ${formatRupees(rules.duesLimit)} blocked` : "dues not blocked",
    rules.blockSuspended ? "suspended blocked" : "suspended allowed",
  ].join(" · ");
  const stats = [
    [isToday ? "Today's check-ins" : "Check-ins", String(board.stats.checkIns)],
    ["In the gym now", String(board.inside)],
    ["Unique members", String(board.stats.unique)],
    ["Avg time inside", board.stats.avgMinutes !== null ? duration(board.stats.avgMinutes) : "—"],
    ["Peak hour", board.stats.peakHour !== null ? hourLabel(board.stats.peakHour) : "—"],
    ["Active members", board.stats.active.toLocaleString("en-IN")],
  ];
  const msg = s("msg");

  return (
    <div className="flex flex-col gap-[30px] pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] tracking-[0.1em] text-muted uppercase">{longDate(today)}</div>
          <h1 className="mt-1 text-[28px] lg:text-[40px]">Attendance</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`${link({ guest: "1" })}#guest`} variant="ghost">
            <UserCirclePlusIcon size={17} weight="duotone" />
            Trial / guest / day pass
          </LinkButton>
          {board.inside > 0 && (
            <form action={closeDayAction}>
              <ConfirmButton confirm={`Check out the ${board.inside} people still inside?`}>
                <DoorOpenIcon size={17} weight="duotone" />
                Check out all ({board.inside})
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>

      {msg && <Notice tone="ok">{msg}</Notice>}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-x-8 gap-y-[22px]">
        {stats.map(([label, value]) => (
          <div key={label}>
            <div className="text-[11px] tracking-[0.08em] text-muted uppercase">{label}</div>
            <div className="mt-1 text-[28px] leading-[1.15] font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-x-12 gap-y-7">
        <div className="flex flex-col gap-3">
          <Segmented options={METHODS.map(([k, label]) => ({ key: k, label, href: link({ method: k === "desk" ? undefined : k }) }))} current={method} />

          {method === "desk" && (
            <>
              <form action="/attendance" className="flex gap-2.5">
                {date !== today && <input type="hidden" name="date" value={date} />}
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Name, member ID or mobile"
                  aria-label="Find member"
                  autoFocus
                  autoComplete="off"
                  className="min-h-9 w-full rounded-md border border-line bg-surface px-3.5 py-3 text-base text-fg placeholder:text-fg/65 hover:border-fg/45 focus:border-accent focus:outline-none"
                />
                <Button variant="primary" className="px-[18px]">
                  <SignInIcon size={16} weight="duotone" />
                  Find
                </Button>
              </form>
              <div className="text-[12.5px] text-muted">Type at least two letters of the name, the member ID or mobile, then press Enter. Rules: {rulesText}.</div>
              {q &&
                (hits.length === 0 ? (
                  <p className="text-sm text-muted">No member matches “{q}”. Try the ID, the mobile number or part of the name.</p>
                ) : (
                  <ul className="overflow-hidden rounded-lg border border-line">
                    {hits.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center gap-3 border-b border-line-soft px-3.5 py-2.5 last:border-b-0">
                        <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-accent-soft text-[12.5px] font-bold text-accent-strong">{initials(m.name)}</span>
                        <span className="min-w-0 flex-1">
                          <Link href={`/members/${m.id}`} className="block truncate font-semibold hover:text-accent">
                            {m.name} <span className="text-xs font-normal text-muted">{m.code} · {m.phone}</span>
                          </Link>
                          <span className={cx("block text-[12.5px]", m.outstanding > 0 || m.status === "EXPIRED" ? "text-alert-700" : "text-muted")}>
                            {m.planName ?? "No plan"}
                            {m.latestEnd ? (m.latestEnd >= today ? ` · ends ${fmtDate(m.latestEnd)}` : " · Expired") : ""}
                            {m.outstanding > 0 ? ` · ${formatRupees(m.outstanding)} due` : ""}
                          </span>
                        </span>
                        <CheckInButton memberId={m.id} canRenew={canRenew} />
                      </li>
                    ))}
                  </ul>
                ))}
            </>
          )}

          {method === "qr" && <QrCheckIn canRenew={canRenew} />}

          {method === "bio" && (
            <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-[18px]">
              <div className="font-semibold">Devices at this branch</div>
              {devices.length === 0 ? (
                <p className="text-sm text-muted">No door device yet.</p>
              ) : (
                devices.map((d) => {
                  const online = d.online;
                  return (
                    <div key={d.id} className="flex justify-between gap-3 border-b border-line-soft py-1.5 text-sm">
                      <span className="flex items-center gap-2">
                        <span className={cx("size-2 rounded-full", online ? "bg-ok" : "bg-alert")} />
                        {d.name ?? d.serial}
                      </span>
                      <span className="text-[12.5px] text-muted">
                        {online ? "Online" : "Offline"} · {d.lastSeenAt ? `last seen ${fmtStamp(d.lastSeenAt)}, ${fmtTime(d.lastSeenAt)}` : "not connected"}
                      </span>
                    </div>
                  );
                })
              )}
              <p className="text-[13px] leading-relaxed text-muted">Face, fingerprint and card punches from these devices are checked against the entry rules and appear in the list below automatically. Check-out happens on the second punch.</p>
              {u.can("settings.manage") && (
                <div>
                  <LinkButton href="/settings/devices">
                    <FingerprintIcon size={16} weight="duotone" />
                    Devices, enrolment &amp; access log
                  </LinkButton>
                </div>
              )}
              <Link href={link({ method: undefined })} className="text-[13px] font-semibold text-accent">
                Device offline? Check in by hand at the front desk
              </Link>
            </div>
          )}

          {s("guest") && (
            <div id="guest" className="flex flex-col gap-3 rounded-lg border border-line p-[18px]">
              <div className="font-semibold">Trial, guest or day pass</div>
              <GuestForm />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-[22px]">
          <div>
            <h3 className="mb-3 text-lg">Last 14 days</h3>
            <div className="flex h-[110px] items-end gap-1.5">
              {trend.map((t) => (
                <Link key={t.date} href={link({ date: t.date === today ? undefined : t.date })} title={`${fmtDate(t.date)}: ${t.count} check-ins`} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-[5px]">
                  <span className="text-center text-[11px] font-semibold">{t.count || ""}</span>
                  <span className="flex min-h-0 flex-1 items-end">
                    <span className={cx("block w-full rounded-t-[2px]", t.date === today ? "bg-accent" : t.date === date ? "bg-accent-700" : "bg-fg/25")} style={{ height: `${(t.count / peak) * 100}%` }} />
                  </span>
                  <span className="overflow-hidden text-center text-[10px] whitespace-nowrap text-muted">{Number(t.date.slice(8))}</span>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-0.5 text-lg">Busy hours</h3>
            <div className="mb-3 text-xs text-muted">Busiest: {hourLabel(busiest.hour)} · average check-ins per day by hour, last 30 days</div>
            <div className="flex h-[110px] items-end gap-1">
              {board.hours.map((h) => (
                <div key={h.hour} title={`${hourLabel(h.hour)}: ${h.count} check-ins in 30 days`} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
                  <div className="text-center text-[10px] font-semibold">{h.perDay || ""}</div>
                  <div className="flex min-h-0 flex-1 items-end">
                    <div className={cx("w-full rounded-t-[2px]", h.hour === busiest.hour && h.count ? "bg-accent" : "bg-fg/25")} style={{ height: `${(h.count / maxHour) * 100}%` }} />
                  </div>
                  <div className="overflow-hidden text-center text-[10px] whitespace-nowrap text-muted">{hourLabel(h.hour, true)}</div>
                </div>
              ))}
            </div>
          </div>
          {board.idle.length > 0 && (
            <div>
              <h3 className="mb-2.5 text-lg">Haven’t visited in 14+ days</h3>
              {board.idle.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-2 text-sm">
                  <Link href={`/members/${m.id}`} className="hover:text-accent">
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-xs text-muted">{m.lastVisit ? `Last visit ${fmtDate(m.lastVisit)}` : "Never visited"}</div>
                  </Link>
                  {canWa && (
                    <form action={nudgeAction.bind(null, m.id, here)}>
                      <Button variant="ghost" className="text-[13px]">
                        <WhatsappLogoIcon size={16} weight="duotone" />
                        Nudge
                      </Button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl">{isToday ? "Today" : fmtDate(date)}</h3>
            <Link href={link({ date: addDays(date, -1) })} aria-label="Previous day" className="grid size-8 place-items-center rounded-md text-accent hover:bg-accent/10">
              <CaretLeftIcon size={16} weight="duotone" />
            </Link>
            <form action="/attendance" className="flex items-center gap-1">
              {method !== "desk" && <input type="hidden" name="method" value={method} />}
              <input type="date" name="date" defaultValue={date} max={today} aria-label="Date" className="min-h-8 rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-fg" />
              <Button variant="ghost" className="min-h-8 text-[13px]">
                Go
              </Button>
            </form>
            {!isToday && (
              <>
                <Link href={link({ date: addDays(date, 1) === today ? undefined : addDays(date, 1) })} aria-label="Next day" className="grid size-8 place-items-center rounded-md text-accent hover:bg-accent/10">
                  <CaretRightIcon size={16} weight="duotone" />
                </Link>
                <Link href={link({ date: undefined })} className="text-[13px] font-semibold text-accent">
                  Today
                </Link>
              </>
            )}
          </div>
          <LinkButton href={`/attendance/csv?date=${date}`} prefetch={false}>
            <DownloadSimpleIcon size={17} weight="duotone" />
            Export CSV
          </LinkButton>
        </div>
        {board.rows.length === 0 ? (
          <div className="py-3 text-sm text-muted">No check-ins on this day.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className={cx(TABLE, "min-w-[860px]")}>
              <thead>
                <tr>
                  {["Member", "Plan / visit", "In", "Out", "Time inside", "Method", "Status", ""].map((h, i) => (
                    <th key={i} className={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.rows.map((r) => (
                  <tr key={r.id} className={TR}>
                    <td className={cx(TD, "whitespace-nowrap")}>
                      {r.member ? (
                        <Link href={`/members/${r.member.id}`} className="hover:text-accent">
                          <div className="font-semibold">{r.member.name}</div>
                          <div className="text-xs text-muted">{r.member.code}</div>
                        </Link>
                      ) : (
                        <>
                          <div className="font-semibold">{r.guestName}</div>
                          <div className="text-xs text-muted">{r.guestPhone ?? ""}</div>
                        </>
                      )}
                    </td>
                    <td className={cx(TD, "whitespace-nowrap")}>
                      {r.member ? (r.planName ?? "No plan") : "Guest"}
                      {r.flag && <div className={cx("text-xs", r.flag.alert ? "text-alert-700" : "text-accent-700")}>{r.flag.text}</div>}
                    </td>
                    <td className={cx(TD, "whitespace-nowrap")}>{fmtTime(r.checkIn)}</td>
                    <td className={cx(TD, "whitespace-nowrap")}>{r.checkOut ? `${fmtTime(r.checkOut)}${r.autoOut ? " · auto" : ""}` : "—"}</td>
                    <td className={cx(TD, "whitespace-nowrap")}>{duration(r.minutes)}</td>
                    <td className={cx(TD, "text-[13px] whitespace-nowrap")} title={r.override ?? undefined}>
                      {r.method}
                      {r.override ? " · allowed by staff" : ""}
                      {u.branchIds.length > 1 ? <div className="text-xs text-muted">{r.branch.name}</div> : null}
                    </td>
                    <td className={TD}>
                      <Tag label={r.checkOut ? "Left" : "Inside"} />
                    </td>
                    <td className={cx(TD, "text-right whitespace-nowrap")}>
                      <span className="inline-flex gap-1">
                        {!r.checkOut && (
                          <form action={checkOutAction.bind(null, r.id)}>
                            <Button variant="ghost" className="text-[13px]">
                              Check out
                            </Button>
                          </form>
                        )}
                        {isToday && (
                          <form action={removeAction.bind(null, r.id)}>
                            <ConfirmButton variant="ghost" className="text-[13px] text-alert-700" confirm="Remove this check-in? Use this only for a wrong entry. It's recorded in the audit log.">
                              Undo
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
      </section>
    </div>
  );
}
