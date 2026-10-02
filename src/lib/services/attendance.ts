import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { DEFAULT_ACCESS, entryBlock, type AccessRules } from "@/lib/domain/access";
import { membershipStatus } from "@/lib/domain/membership";
import { audit } from "./audit";
import { UserError } from "./errors";
import { memberScope, summarize } from "./members";
import { notify } from "./notifications";
import { getSetting } from "./settings";
import { sendTemplate } from "./whatsapp";
import { fromIso, istInstant, toIso, todayIso } from "./time";

export const getAccessRules = async (orgId: string): Promise<AccessRules> => ({ ...DEFAULT_ACCESS, ...((await getSetting<Partial<AccessRules>>(orgId, "access")) ?? {}) });

/** Members matching what the desk typed: exact ID, phone digits, or part of the name. */
export async function findForCheckIn(u: CurrentUser, q: string) {
  const t = q.trim();
  if (!t) return [];
  const digits = t.replace(/\D/g, "");
  const members = await db.member.findMany({
    where: {
      ...memberScope(u),
      walkIn: false,
      OR: [{ code: { equals: t, mode: "insensitive" } }, ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-10) } }] : []), { name: { contains: t, mode: "insensitive" } }],
    },
    take: 8,
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, phone: true, suspended: true },
  });
  // An exact ID match wins outright.
  const exact = members.find((m) => m.code.toLowerCase() === t.toLowerCase());
  const list = exact ? [exact] : members;
  const today = todayIso();
  const sums = await summarize(list.map((m) => m.id), today);
  return list.map((m) => {
    const s = sums.get(m.id)!;
    return { ...m, ...s, status: membershipStatus({ suspended: m.suspended, latestEnd: s.latestEnd, outstanding: s.outstanding, today }) };
  });
}

/** Where a check-in is recorded: the branch the desk is working in, else the member's home branch. */
const deskBranch = (u: CurrentUser, fallback: string) => (u.branch !== "ALL" ? u.branch : fallback);

export type CheckInResult = { ok: true; name: string; daysLeft: number | null; outstanding: number } | { ok: false; blocked: string; memberId: string; name: string };

/**
 * Checks a member in, applying the gym's entry rules. A blocked member comes back with the reason;
 * staff can let them in anyway by giving an override reason, which is audited and raises a notification.
 */
export async function checkIn(u: CurrentUser, memberId: string, opts: { method?: string; override?: string } = {}): Promise<CheckInResult> {
  const m = await db.member.findFirst({ where: { ...memberScope(u), id: memberId, walkIn: false } });
  if (!m) throw new UserError("Member not found.");
  const today = todayIso();
  const s = (await summarize([m.id], today)).get(m.id)!;
  const block = entryBlock({ suspended: m.suspended, ...s }, await getAccessRules(u.orgId), today);
  const override = opts.override?.trim();
  if (block && !override) return { ok: false, blocked: block, memberId: m.id, name: m.name };

  const branchId = deskBranch(u, m.branchId);
  await db.$transaction(async (tx) => {
    const open = await tx.attendance.findFirst({ where: { memberId: m.id, date: fromIso(today), checkOut: null } });
    if (open) throw new UserError(`${m.name} is already inside.`);
    const a = await tx.attendance.create({
      data: { branchId, memberId: m.id, type: "MEMBER", date: fromIso(today), checkIn: new Date(), method: opts.method ?? "Manual", override: block ? `${block}: ${override}` : null, createdById: u.id },
    });
    if (block) {
      await audit(tx, { orgId: u.orgId, userId: u.id, action: "attendance.override", entity: "Attendance", entityId: a.id, after: { member: m.code, block, reason: override } });
      await notify(tx, { orgId: u.orgId, branchId, type: "CHECKIN_OVERRIDE", text: `${u.name} let ${m.name} in despite "${block}": ${override}`, link: `/members/${m.id}` });
    }
  });
  const daysLeft = s.latestEnd ? Math.round((fromIso(s.latestEnd).getTime() - fromIso(today).getTime()) / 86_400_000) : null;
  return { ok: true, name: m.name, daysLeft, outstanding: s.outstanding };
}

export async function checkInGuest(u: CurrentUser, name: string, phone: string | undefined) {
  const branchId = u.branch !== "ALL" ? u.branch : u.branches[0]?.id;
  if (!branchId) throw new UserError("Pick a branch first.");
  await db.attendance.create({ data: { branchId, type: "GUEST", guestName: name, guestPhone: phone ?? null, date: fromIso(todayIso()), checkIn: new Date(), method: "Manual", createdById: u.id } });
}

const attScope = (u: CurrentUser) => ({ branchId: { in: u.branchIds } });

export async function checkOut(u: CurrentUser, id: string) {
  const a = await db.attendance.findFirst({ where: { ...attScope(u), id } });
  if (!a) throw new UserError("Check-in not found.");
  if (a.checkOut) return;
  await db.attendance.update({ where: { id }, data: { checkOut: new Date() } });
}

/** Removes a wrong check-in made by mistake. Audited. */
export async function removeCheckIn(u: CurrentUser, id: string) {
  const before = await db.attendance.findFirst({ where: { ...attScope(u), id } });
  if (!before) throw new UserError("Check-in not found.");
  await db.$transaction(async (tx) => {
    await tx.attendance.delete({ where: { id } });
    await audit(tx, { orgId: u.orgId, userId: u.id, action: "attendance.remove", entity: "Attendance", entityId: id, before });
  });
}

/** Checks out everyone still inside, now. Earlier days are closed at the gym's closing time. */
export async function closeDay(u: CurrentUser, closingTime = "22:00") {
  const today = todayIso();
  const stale = await db.attendance.findMany({ where: { ...attScope(u), checkOut: null, date: { lt: fromIso(today) } }, select: { id: true, date: true } });
  await db.$transaction(async (tx) => {
    for (const a of stale) await tx.attendance.update({ where: { id: a.id }, data: { checkOut: istInstant(toIso(a.date), closingTime), autoOut: true } });
    await tx.attendance.updateMany({ where: { ...attScope(u), checkOut: null, date: fromIso(today) }, data: { checkOut: new Date(), autoOut: true } });
  });
}

export async function listDay(u: CurrentUser, date: string) {
  const rows = await db.attendance.findMany({
    where: { ...attScope(u), date: fromIso(date) },
    orderBy: { checkIn: "desc" },
    include: { member: { select: { id: true, code: true, name: true } }, branch: { select: { name: true } } },
  });
  return { rows, inside: rows.filter((r) => !r.checkOut).length, members: new Set(rows.filter((r) => r.memberId).map((r) => r.memberId)).size, guests: rows.filter((r) => r.type === "GUEST").length };
}

/** Daily check-ins for the last `days` days, for the trend strip. */
export async function dailyCounts(u: CurrentUser, days = 14) {
  const today = todayIso();
  const from = new Date(fromIso(today).getTime() - (days - 1) * 86_400_000);
  const g = await db.attendance.groupBy({ by: ["date"], where: { ...attScope(u), date: { gte: from } }, _count: { _all: true } });
  const map = new Map(g.map((x) => [toIso(x.date), x._count._all]));
  return Array.from({ length: days }, (_, i) => {
    const d = toIso(new Date(from.getTime() + i * 86_400_000));
    return { date: d, count: map.get(d) ?? 0 };
  });
}

export const memberVisits = (memberId: string, take = 30) => db.attendance.findMany({ where: { memberId }, orderBy: { checkIn: "desc" }, take });

/** Hour of day (0–23) of a check-in, Indian time. */
const istHour = (d: Date) => new Date(d.getTime() + 330 * 60_000).getUTCHours();
/** Minutes a visit has lasted: until check-out, or until now for someone still inside today. */
const minutesInside = (a: { checkIn: Date; checkOut: Date | null }, now: Date, isToday: boolean) =>
  Math.max(0, Math.round(((a.checkOut ?? (isToday ? now : a.checkIn)).getTime() - a.checkIn.getTime()) / 60_000));

/**
 * Everything the prototype's attendance screen shows: the day's visits with each member's plan and
 * flags, the day's figures, average check-ins by hour over 30 days, and active members who haven't
 * come in for 14 days or more.
 */
export async function attendanceBoard(u: CurrentUser, date: string) {
  const today = todayIso();
  const isToday = date === today;
  const now = new Date();
  const from30 = new Date(fromIso(today).getTime() - 29 * 86_400_000);
  const [day, inside, recent, members, lastVisits] = await Promise.all([
    listDay(u, date),
    db.attendance.count({ where: { ...attScope(u), date: fromIso(today), checkOut: null } }),
    db.attendance.findMany({ where: { ...attScope(u), date: { gte: from30 } }, select: { checkIn: true } }),
    db.member.findMany({ where: { ...memberScope(u), walkIn: false }, select: { id: true, code: true, name: true, suspended: true } }),
    db.attendance.groupBy({ by: ["memberId"], where: { ...attScope(u), memberId: { not: null } }, _max: { date: true } }),
  ]);
  const sums = await summarize(members.map((m) => m.id), today);
  const left = (end: string | null) => (end ? Math.round((fromIso(end).getTime() - fromIso(today).getTime()) / 86_400_000) : null);

  const rows = day.rows.map((r) => {
    const s = r.memberId ? sums.get(r.memberId) : undefined;
    const daysLeft = s ? left(s.latestEnd) : null;
    return {
      ...r,
      planName: s?.planName ?? null,
      flag: s && s.outstanding > 0 ? { text: `₹${Math.round(s.outstanding / 100).toLocaleString("en-IN")} due`, alert: true } : daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 ? { text: `Ends in ${daysLeft} d`, alert: false } : null,
      minutes: minutesInside(r, now, isToday),
    };
  });
  const done = rows.filter((r) => r.checkOut);
  const byHour = new Map<number, number>();
  for (const r of rows) byHour.set(istHour(r.checkIn), (byHour.get(istHour(r.checkIn)) ?? 0) + 1);
  const peakHour = [...byHour].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;

  const hours30 = new Map<number, number>();
  for (const r of recent) hours30.set(istHour(r.checkIn), (hours30.get(istHour(r.checkIn)) ?? 0) + 1);
  const hours = Array.from({ length: 18 }, (_, i) => i + 5).map((h) => ({ hour: h, count: hours30.get(h) ?? 0, perDay: Math.round(((hours30.get(h) ?? 0) / 30) * 10) / 10 }));

  const active = members.filter((m) => !m.suspended && (left(sums.get(m.id)!.latestEnd) ?? -1) >= 0);
  const last = new Map(lastVisits.map((v) => [v.memberId!, v._max.date ? toIso(v._max.date) : null]));
  const idle = active
    .map((m) => ({ ...m, lastVisit: last.get(m.id) ?? null }))
    .filter((m) => !m.lastVisit || Math.round((fromIso(today).getTime() - fromIso(m.lastVisit).getTime()) / 86_400_000) >= 14)
    .sort((a, b) => (a.lastVisit ?? "0").localeCompare(b.lastVisit ?? "0"))
    .slice(0, 5);

  return {
    rows,
    inside,
    stats: {
      checkIns: rows.length,
      unique: day.members,
      avgMinutes: done.length ? Math.round(done.reduce((a, r) => a + r.minutes, 0) / done.length) : null,
      peakHour,
      active: active.length,
    },
    hours,
    idle,
  };
}

/** A friendly "we miss you" WhatsApp to a member who hasn't visited in a while. */
export async function nudgeMember(u: CurrentUser, memberId: string) {
  const m = await db.member.findFirst({ where: { ...memberScope(u), id: memberId, walkIn: false }, select: { id: true, name: true } });
  if (!m) throw new UserError("Member not found.");
  const sent = await sendTemplate({ orgId: u.orgId, memberId: m.id, key: "campaign", userId: u.id, body: "Hi {{member_name}}, we have missed you at {{gym_name}}! Come in this week and let's get back on track." });
  return { name: m.name, sent: !!sent };
}
