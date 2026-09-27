"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/current";
import { formAction, simpleAction } from "@/lib/form-action";
import { classInput } from "@/lib/validation/frontdesk";
import type { FormState } from "@/lib/validation/common";
import { book, getSlot, saveSlot, setBookingStatus, setSlotActive } from "@/lib/services/classes";
import { sendLater } from "@/lib/services/whatsapp";
import { fmtClock, fmtDate } from "@/lib/format";
import { resolveMemberRef } from "@/lib/services/members";
import { UserError } from "@/lib/services/errors";

export async function saveClass(id: string | null, _: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePermission("classes.manage");
  let newId = id;
  const r = await formAction(fd, classInput, async (d) => {
    newId = (await saveSlot(u, id, d)).id;
  }, "Class saved.");
  if (!r?.ok) return r;
  revalidatePath("/classes");
  redirect(`/classes/${newId}`);
}

export async function toggleClass(id: string, active: boolean) {
  const u = await requirePermission("classes.manage");
  await setSlotActive(u, id, active);
  revalidatePath("/classes");
  revalidatePath(`/classes/${id}`);
}

export async function bookAction(slotId: string, date: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePermission("classes.manage");
  const r = await simpleAction(async () => {
    const m = await resolveMemberRef(u, String(fd.get("member") ?? ""));
    if (!m) throw new UserError("Pick a member from the list.");
    const b = await book(u, slotId, date, m.id);
    if (b.status === "Booked") {
      const slot = await getSlot(u, slotId);
      sendLater({ orgId: u.orgId, memberId: m.id, key: "class", userId: u.id, vars: { class_name: slot?.name ?? "", class_time: `${fmtDate(date)}, ${fmtClock(slot?.startTime ?? "00:00")}` } });
    }
    if (b.status === "Waitlist") throw new UserError(`The class is full, so ${m.name} is on the waitlist.`);
  }, "Booked.");
  revalidatePath(`/classes/${slotId}`);
  revalidatePath("/classes");
  return r;
}

export async function bookingStatusAction(id: string, slotId: string, status: "Cancelled" | "Attended" | "No-show" | "Booked") {
  const u = await requirePermission("classes.manage");
  await setBookingStatus(u, id, status);
  revalidatePath(`/classes/${slotId}`);
  revalidatePath("/classes");
}
