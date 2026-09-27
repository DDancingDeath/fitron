"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current";
import { staffInput } from "@/lib/validation/staff";
import { failed, fieldErrors, type FormState } from "@/lib/validation/common";
import { createStaff, setStaffActive, updateStaff } from "@/lib/services/staff";
import { UserError } from "@/lib/services/errors";

export async function saveStaff(id: string | null, _: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePermission("staff.manage");
  const raw = Object.fromEntries([...fd.keys()].filter((k) => k !== "branchIds").map((k) => [k, fd.get(k)]));
  const parsed = staffInput.safeParse({ ...raw, branchIds: fd.getAll("branchIds") });
  if (!parsed.success) return failed(fd, { errors: fieldErrors(parsed.error), message: "Check the highlighted fields." });
  try {
    if (id) await updateStaff(u, id, parsed.data);
    else await createStaff(u, parsed.data);
  } catch (e) {
    if (e instanceof UserError) return failed(fd, { message: e.message, errors: e.field ? { [e.field]: [e.message] } : undefined });
    throw e;
  }
  revalidatePath("/staff");
  redirect("/staff");
}

export async function toggleStaff(id: string, active: boolean): Promise<void> {
  const u = await requirePermission("staff.manage");
  try {
    await setStaffActive(u, id, active);
  } catch (e) {
    if (e instanceof UserError) redirect(`/staff?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/staff");
}
