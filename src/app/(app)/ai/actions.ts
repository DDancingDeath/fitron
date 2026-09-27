"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current";
import { simpleAction } from "@/lib/form-action";
import type { FormState } from "@/lib/validation/common";
import { confirmProposal, dismissProposal } from "@/lib/services/ai";
import { computeRisk } from "@/lib/services/insights";
import { getWaSettings } from "@/lib/services/whatsapp";

export async function sendProposalAction(id: string): Promise<FormState> {
  const u = await requirePermission("ai.use");
  let msg = "";
  const r = await simpleAction(async () => {
    const res = await confirmProposal(u, id);
    const mode = (await getWaSettings(u.orgId)).mode;
    msg = `${res.sent} ${mode === "demo" ? "logged (demo mode, not sent)" : mode === "connector" ? "queued on the linked phone" : "sent"}${res.failed ? `, ${res.failed} failed` : ""}.`;
  }, "");
  revalidatePath("/whatsapp");
  return r?.ok ? { ...r, message: msg } : r;
}

export async function dismissProposalAction(id: string): Promise<FormState> {
  const u = await requirePermission("ai.use");
  return simpleAction(() => dismissProposal(u, id), "Dismissed.");
}

export async function refreshRiskAction() {
  const u = await requirePermission("members.view");
  await computeRisk(u.orgId);
  revalidatePath("/ai");
}
