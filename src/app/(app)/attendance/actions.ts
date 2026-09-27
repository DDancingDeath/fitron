"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current";
import { formAction } from "@/lib/form-action";
import { guestInput } from "@/lib/validation/frontdesk";
import type { FormState } from "@/lib/validation/common";
import { checkIn, checkInGuest, checkOut, closeDay, removeCheckIn } from "@/lib/services/attendance";
import { UserError } from "@/lib/services/errors";

export type CheckInState = { ok?: boolean; message?: string; blocked?: string } | undefined;

export async function checkInAction(memberId: string, _: CheckInState, fd: FormData): Promise<CheckInState> {
  const u = await requirePermission("attendance.manage");
  try {
    const r = await checkIn(u, memberId, { override: (fd.get("override") as string) || undefined });
    if (!r.ok) return { blocked: r.blocked };
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
