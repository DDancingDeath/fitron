import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { writeBranch } from "@/lib/auth/current";
import type { Prisma } from "@/generated/prisma/client";
import { addDays } from "@/lib/domain/dates";
import type { ClassInput } from "@/lib/validation/frontdesk";
import { audit } from "./audit";
import { isUniqueViolation, UserError } from "./errors";
import { memberScope } from "./members";
import { notify } from "./notifications";
import { fromIso, toIso, todayIso } from "./time";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** 0 = Monday … 6 = Sunday */
export const weekdayOf = (iso: string) => (fromIso(iso).getUTCDay() + 6) % 7;
export const weekStart = (iso: string) => addDays(iso, -weekdayOf(iso));

/** Bookings that hold a place in the class. */
const HOLDS = ["Booked", "Attended", "No-show"];

const scope = (u: CurrentUser): Prisma.ClassSlotWhereInput => ({ orgId: u.orgId, branchId: { in: u.branchIds } });

export async function trainers(u: CurrentUser) {
  return db.user.findMany({
    where: { orgId: u.orgId, active: true, deletedAt: null, branches: { some: { branchId: { in: u.branchIds } } }, role: { permissions: { some: { permission: { key: "classes.manage" } } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** The week's timetable with how full each session is. */
export async function weekSchedule(u: CurrentUser, start: string) {
  const end = addDays(start, 6);
  const slots = await db.classSlot.findMany({ where: { ...scope(u), active: true }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }], include: { branch: { select: { name: true } } } });
  const counts = await db.booking.groupBy({ by: ["classSlotId", "date", "status"], where: { classSlotId: { in: slots.map((s) => s.id) }, date: { gte: fromIso(start), lte: fromIso(end) } }, _count: { _all: true } });
  const names = new Map((await trainers(u)).map((t) => [t.id, t.name]));
  return slots.map((s) => {
    const date = addDays(start, s.weekday);
    const c = counts.filter((x) => x.classSlotId === s.id && toIso(x.date) === date);
    const n = (st: string[]) => c.filter((x) => st.includes(x.status)).reduce((a, x) => a + x._count._all, 0);
    return { ...s, date, trainerName: names.get(s.trainerId) ?? "—", booked: n(HOLDS), waitlist: n(["Waitlist"]) };
  });
}

export const getSlot = (u: CurrentUser, id: string) => db.classSlot.findFirst({ where: { ...scope(u), id } });

export async function getSession(u: CurrentUser, slotId: string, date: string) {
  const slot = await db.classSlot.findFirst({ where: { ...scope(u), id: slotId }, include: { branch: { select: { name: true } } } });
  if (!slot || weekdayOf(date) !== slot.weekday) return null;
  const bookings = await db.booking.findMany({
    where: { classSlotId: slotId, date: fromIso(date) },
    orderBy: { createdAt: "asc" },
    include: { member: { select: { id: true, code: true, name: true, phone: true } } },
  });
  const trainer = await db.user.findUnique({ where: { id: slot.trainerId }, select: { name: true } });
  return { slot, date, bookings, trainerName: trainer?.name ?? "—", held: bookings.filter((b) => HOLDS.includes(b.status)).length };
}

export async function saveSlot(u: CurrentUser, id: string | null, input: ClassInput) {
  const branchId = writeBranch(u);
  if (!branchId) throw new UserError("Pick a branch first.");
  const before = id ? await db.classSlot.findFirst({ where: { ...scope(u), id } }) : null;
  if (id && !before) throw new UserError("Class not found.");
  return db.$transaction(async (tx) => {
    const after = before
      ? await tx.classSlot.update({ where: { id: before.id }, data: { ...input, room: input.room ?? null } })
      : await tx.classSlot.create({ data: { ...input, room: input.room ?? null, orgId: u.orgId, branchId } });
    await audit(tx, { orgId: u.orgId, userId: u.id, action: before ? "class.update" : "class.create", entity: "ClassSlot", entityId: after.id, before, after });
    return after;
  });
}

export async function setSlotActive(u: CurrentUser, id: string, active: boolean) {
  const before = await db.classSlot.findFirst({ where: { ...scope(u), id } });
  if (!before) throw new UserError("Class not found.");
  await db.$transaction(async (tx) => {
    const after = await tx.classSlot.update({ where: { id }, data: { active } });
    await audit(tx, { orgId: u.orgId, userId: u.id, action: active ? "class.activate" : "class.deactivate", entity: "ClassSlot", entityId: id, before, after });
  });
}

/** Books a member into a session; once it's full they go on the waitlist. */
export async function book(u: CurrentUser, slotId: string, date: string, memberId: string) {
  const slot = await db.classSlot.findFirst({ where: { ...scope(u), id: slotId, active: true } });
  if (!slot) throw new UserError("Class not found.");
  if (weekdayOf(date) !== slot.weekday) throw new UserError("That class doesn't run on this date.");
  if (date < todayIso()) throw new UserError("This session is in the past.");
  const member = await db.member.findFirst({ where: { ...memberScope(u), id: memberId, walkIn: false } });
  if (!member) throw new UserError("Member not found.", "memberId");
  try {
    return await db.$transaction(async (tx) => {
      // Lock the class row so two desks can't both take the last place.
      await tx.$queryRaw`SELECT id FROM "ClassSlot" WHERE id = ${slotId} FOR UPDATE`;
      const held = await tx.booking.count({ where: { classSlotId: slotId, date: fromIso(date), status: { in: HOLDS } } });
      const status = held >= slot.capacity ? "Waitlist" : "Booked";
      const existing = await tx.booking.findUnique({ where: { classSlotId_date_memberId: { classSlotId: slotId, date: fromIso(date), memberId } } });
      if (existing && existing.status !== "Cancelled") throw new UserError(`${member.name} is already ${existing.status === "Waitlist" ? "on the waitlist" : "booked"}.`);
      const b = existing
        ? await tx.booking.update({ where: { id: existing.id }, data: { status, createdAt: new Date() } })
        : await tx.booking.create({ data: { classSlotId: slotId, date: fromIso(date), memberId, status } });
      await audit(tx, { orgId: u.orgId, userId: u.id, action: "booking.create", entity: "Booking", entityId: b.id, after: b });
      return b;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError(`${member.name} is already booked.`);
    throw e;
  }
}

/**
 * Cancelling a booked place moves the first person on the waitlist in and tells the desk.
 * Attended / No-show can only be marked on or after the session day.
 */
export async function setBookingStatus(u: CurrentUser, bookingId: string, status: "Cancelled" | "Attended" | "No-show" | "Booked") {
  const before = await db.booking.findFirst({ where: { id: bookingId, classSlot: scope(u) }, include: { classSlot: true, member: { select: { name: true } } } });
  if (!before) throw new UserError("Booking not found.");
  const date = toIso(before.date);
  if ((status === "Attended" || status === "No-show") && date > todayIso()) throw new UserError("Mark attendance on the day of the class.");
  if (status === "Booked" && before.status !== "Attended" && before.status !== "No-show") throw new UserError("Only attendance can be undone this way.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ClassSlot" WHERE id = ${before.classSlotId} FOR UPDATE`;
    const after = await tx.booking.update({ where: { id: bookingId }, data: { status } });
    await audit(tx, { orgId: u.orgId, userId: u.id, action: "booking.status", entity: "Booking", entityId: bookingId, before, after });
    let promoted: string | null = null;
    let promotedId: string | null = null;
    if (status === "Cancelled" && before.status === "Booked") {
      const next = await tx.booking.findFirst({ where: { classSlotId: before.classSlotId, date: before.date, status: "Waitlist" }, orderBy: { createdAt: "asc" }, include: { member: { select: { name: true } } } });
      if (next) {
        await tx.booking.update({ where: { id: next.id }, data: { status: "Booked" } });
        await audit(tx, { orgId: u.orgId, userId: u.id, action: "booking.promote", entity: "Booking", entityId: next.id, after: { status: "Booked" } });
        await notify(tx, {
          orgId: u.orgId,
          branchId: before.classSlot.branchId,
          type: "WAITLIST",
          text: `${next.member.name} moved off the waitlist into ${before.classSlot.name} on ${date}.`,
          link: `/classes/${before.classSlotId}?date=${date}`,
        });
        promoted = next.member.name;
        promotedId = next.memberId;
      }
    }
    return { promoted, promotedId };
  });
}

/** "Mark all attended": every booked place in a session that has happened (or is today). */
export async function markAllAttended(u: CurrentUser, slotId: string, date: string) {
  const slot = await db.classSlot.findFirst({ where: { ...scope(u), id: slotId } });
  if (!slot) throw new UserError("Class not found.");
  if (date > todayIso()) throw new UserError("Mark attendance on the day of the class.");
  const booked = await db.booking.findMany({ where: { classSlotId: slotId, date: fromIso(date), status: "Booked" } });
  await db.$transaction(async (tx) => {
    await tx.booking.updateMany({ where: { id: { in: booked.map((b) => b.id) } }, data: { status: "Attended" } });
    await audit(tx, { orgId: u.orgId, userId: u.id, action: "booking.attended_all", entity: "ClassSlot", entityId: slotId, after: { date, count: booked.length } });
  });
  return booked.length;
}

/** Members holding a booked place in a session, for "Remind everyone". */
export const bookedMembers = async (u: CurrentUser, slotId: string, date: string) =>
  (await db.booking.findMany({ where: { classSlotId: slotId, date: fromIso(date), status: "Booked", classSlot: scope(u) }, select: { memberId: true } })).map((b) => b.memberId);

export const memberBookings = (memberId: string) =>
  db.booking.findMany({ where: { memberId }, orderBy: { date: "desc" }, take: 20, include: { classSlot: { select: { id: true, name: true, startTime: true } } } });
