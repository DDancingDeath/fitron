"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/current";
import { formAction } from "@/lib/form-action";
import { guestInput } from "@/lib/validation/frontdesk";
import type { FormState } from "@/lib/validation/common";
import { checkIn, checkInGuest, checkOut, closeDay, nudgeMember, removeCheckIn } from "@/lib/services/attendance";
import { memberScope } from "@/lib/services/members";
import { UserError } from "@/lib/services/errors";

export type CheckInState = { ok?: boolean; message?: string; blocked?: string; memberId?: string; nonce?: number } | undefined;

export async function checkInAction(memberId: string, _: CheckInState, fd: FormData): Promise<CheckInState> {
  const u = await requirePermission("attendance.manage");
  try {
    const r = await checkIn(u, memberId, { override: (fd.get("override") as string) || undefined, method: (fd.get("method") as string) === "QR" ? "QR" : undefined });
    if (!r.ok) return { blocked: r.blocked, memberId };
    revalidatePath("/attendance");
    const extra = [r.daysLeft != null && r.daysLeft >= 0 && r.daysLeft <= 7 ? `plan ends in ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}` : null, r.outstanding > 0 ? `₹${(r.outstanding / 100).toLocaleString("en-IN")} due` : null].filter(Boolean);
    return { ok: true, message: `${r.name} checked in${extra.length ? ` · ${extra.join(" · ")}` : ""}` };
  } catch (e) {
    if (e instanceof UserError) return { message: e.message };
    throw e;
  }
}

export async function guestAction(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePermission("attendance.manage");
  const r = await formAction(fd, guestInput, (d) => checkInGuest(u, d.name, d.phone), "Guest checked in.");
  revalidatePath("/attendance");
  return r;
}

export async function checkOutAction(id: string) {
  const u = await requirePermission("attendance.manage");
  await checkOut(u, id);
  revalidatePath("/attendance");
}

export async function removeAction(id: string) {
  const u = await requirePermission("attendance.manage");
  await removeCheckIn(u, id);
  revalidatePath("/attendance");
}

export async function closeDayAction() {
  const u = await requirePermission("attendance.manage");
  await closeDay(u);
  revalidatePath("/attendance");
}

/** QR mode: the member ID read from a member's card (or typed from it). */
export async function checkInCodeAction(_: CheckInState, fd: FormData): Promise<CheckInState> {
  const u = await requirePermission("attendance.manage");
  const code = String(fd.get("code") ?? "").trim();
  if (!code) return { message: "Scan or type the member ID." };
  const m = await db.member.findFirst({ where: { ...memberScope(u), walkIn: false, code: { equals: code, mode: "insensitive" } }, select: { id: true } });
  if (!m) return { message: `No member with ID ${code}.`, nonce: Date.now() };
  fd.set("method", "QR");
  return { ...(await checkInAction(m.id, undefined, fd)), memberId: m.id, nonce: Date.now() };
}

export async function nudgeAction(memberId: string, back: string) {
  const u = await requirePermission("whatsapp.send");
  let msg: string;
  try {
    const r = await nudgeMember(u, memberId);
    msg = r.sent ? `Come-back message sent to ${r.name} on WhatsApp.` : `Not sent: ${r.name} has no WhatsApp number.`;
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    msg = e.message;
  }
  const to = back.startsWith("/attendance") ? back : "/attendance";
  redirect(`${to}${to.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}
