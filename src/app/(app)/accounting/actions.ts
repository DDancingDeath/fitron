"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current";
import { lockMonth, unlockMonth } from "@/lib/services/accounting";
import { UserError } from "@/lib/services/errors";

export async function lock(month: string): Promise<void> {
  const u = await requirePermission("months.lock");
  try {
    await lockMonth(u, month);
  } catch (e) {
    if (e instanceof UserError) redirect(`/accounting?tab=close&month=${month}&error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/accounting");
}

export async function unlock(month: string): Promise<void> {
  const u = await requirePermission("months.unlock");
  await unlockMonth(u, month);
  revalidatePath("/accounting");
}
