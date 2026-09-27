"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current";
import { formAction, simpleAction } from "@/lib/form-action";
import { progressInput } from "@/lib/validation/frontdesk";
import type { FormState } from "@/lib/validation/common";
import { addProgress, assignPrograms } from "@/lib/services/programs";

export async function assignAction(memberId: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePermission("programs.manage");
  const r = await simpleAction(() => assignPrograms(u, memberId, { workoutPlanId: (fd.get("workoutPlanId") as string) || null, dietPlanId: (fd.get("dietPlanId") as string) || null }), "Plans saved.");
  revalidatePath(`/members/${memberId}`);
  return r;
}

export async function progressAction(memberId: string, _: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePermission("programs.manage");
  const r = await formAction(fd, progressInput, (d) => addProgress(u, memberId, d), "Measurement added.");
  revalidatePath(`/members/${memberId}`);
  return r;
}
