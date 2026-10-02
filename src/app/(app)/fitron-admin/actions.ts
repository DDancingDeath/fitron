"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { isFitronAdmin } from "@/lib/integrations/upi";
import { reviewPayment } from "@/lib/services/saas";
import { UserError } from "@/lib/services/errors";

export type ReviewState = { error?: string; done?: string } | null;

/** FITRON team only: confirm or reject a UTR a gym entered. */
export async function reviewAction(_: ReviewState, form: FormData): Promise<ReviewState> {
  const u = await requireUser();
  if (!isFitronAdmin(u.email)) notFound();
  const id = String(form.get("id") ?? "");
  const decision = form.get("decision") === "CONFIRM" ? "CONFIRM" : "REJECT";
  try {
    await reviewPayment(u, id, decision, String(form.get("reason") ?? ""));
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
  revalidatePath("/fitron-admin");
  return { done: decision === "CONFIRM" ? "Confirmed. The gym has been told and its invoice is issued." : "Rejected. The gym has been told why." };
}
