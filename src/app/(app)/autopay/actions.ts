"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/current";
import { simpleAction } from "@/lib/form-action";
import type { FormState } from "@/lib/validation/common";
import { changeMandate, createMandate } from "@/lib/services/autopay";
import { resolveMemberRef } from "@/lib/services/members";
import { UserError } from "@/lib/services/errors";

export async function createAction(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePermission("autopay.manage");
  let id = "";
  const r = await simpleAction(async () => {
    const m = await resolveMemberRef(u, String(fd.get("member") ?? ""));
    if (!m) throw new UserError("Pick a member from the list.");
    const start = String(fd.get("startOn") ?? "") || undefined;
    if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new UserError("Pick the first debit date.");
    id = (await createMandate(u, { memberId: m.id, planId: String(fd.get("planId") ?? ""), startOn: start })).id;
  }, "");
  if (!r?.ok) return r;
  revalidatePath("/autopay");
  redirect(`/autopay/${id}`);
}

export async function changeAction(id: string, action: "pause" | "resume" | "cancel" | "approve-demo"): Promise<FormState> {
  const u = await requirePermission("autopay.manage");
  const r = await simpleAction(() => changeMandate(u, id, action), "Done.");
  revalidatePath(`/autopay/${id}`);
  revalidatePath("/autopay");
  return r;
}
