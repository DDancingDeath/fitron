"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/current";
import { formAction, simpleAction } from "@/lib/form-action";
import { leadInput, type LeadStage } from "@/lib/validation/frontdesk";
import type { FormState } from "@/lib/validation/common";
import { createLead, setLeadStage, updateLead } from "@/lib/services/leads";

export async function saveLead(id: string | null, _: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePermission("leads.manage");
  let newId = id;
  const r = await formAction(fd, leadInput, async (d) => {
    if (id) await updateLead(u, id, d);
    else newId = (await createLead(u, d)).id;
  }, "Lead saved.");
  if (!r?.ok) return r;
  revalidatePath("/leads");
  if (!id) redirect(`/leads/${newId}`);
  return r;
}

export async function stageAction(id: string, stage: LeadStage, _: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePermission("leads.manage");
  const r = await simpleAction(() => setLeadStage(u, id, stage, { lostReason: (fd.get("reason") as string) || undefined, trialOn: (fd.get("trialOn") as string) || undefined }), `Moved to ${stage}.`);
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return r;
}
