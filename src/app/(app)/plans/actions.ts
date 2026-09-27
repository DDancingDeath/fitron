"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current";
import { planInput } from "@/lib/validation/plan";
import { failed, fieldErrors, type FormState } from "@/lib/validation/common";
import { createPlan, deletePlan, setPlanStatus, updatePlan } from "@/lib/services/plans";
import { UserError } from "@/lib/services/errors";

export async function savePlan(id: string | null, _: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePermission("plans.manage");
  const parsed = planInput.safeParse(Object.fromEntries([...fd.keys()].map((k) => [k, fd.get(k)])));
  if (!parsed.success) return failed(fd, { errors: fieldErrors(parsed.error), message: "Check the highlighted fields." });
  try {
    if (id) await updatePlan(u, id, parsed.data);
    else await createPlan(u, parsed.data);
  } catch (e) {
    if (e instanceof UserError) return failed(fd, { message: e.message });
    throw e;
  }
  revalidatePath("/plans");
  redirect("/plans");
}

export async function changePlanStatus(id: string, status: "ACTIVE" | "INACTIVE") {
  const u = await requirePermission("plans.manage");
  await setPlanStatus(u, id, status);
  revalidatePath("/plans");
}

export async function removePlan(id: string): Promise<void> {
  const u = await requirePermission("plans.manage");
  try {
    await deletePlan(u, id);
  } catch (e) {
    if (e instanceof UserError) redirect(`/plans?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/plans");
  redirect("/plans");
}
