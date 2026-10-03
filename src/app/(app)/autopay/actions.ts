"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/current";
import { simpleAction } from "@/lib/form-action";
import type { FormState } from "@/lib/validation/common";
import { changeMandate, createMandate, getAutopayMode, retryDemoDebit, runAutopayDay } from "@/lib/services/autopay";
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
    id = (await createMandate(u, { memberId: m.id, planId: String(fd.get("planId") ?? ""), startOn: start, vpa: String(fd.get("vpa") ?? "") })).id;
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

const back = (msg: string, f?: string) => redirect(`/autopay?${f ? `f=${encodeURIComponent(f)}&` : ""}msg=${encodeURIComponent(msg)}`);
const said = async (fn: () => Promise<string>) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return e.message;
    throw e;
  }
};

/** The table's row buttons: Approve now, Pause / Resume, Cancel. */
export async function rowAction(id: string, action: "pause" | "resume" | "cancel" | "approve-demo", f: string) {
  const u = await requirePermission("autopay.manage");
  const msg = await said(async () => {
    await changeMandate(u, id, action);
    return { pause: "Autopay paused.", resume: "Autopay resumed.", cancel: "Autopay cancelled.", "approve-demo": "Mandate approved." }[action];
  });
  revalidatePath("/autopay");
  back(msg, f);
}

/** "Retry now" (demo mode). */
export async function retryAction(id: string, f: string) {
  const u = await requirePermission("autopay.manage");
  const msg = await said(async () => ((await retryDemoDebit(u, id)) === "renewed" ? "Debit succeeded. Membership renewed and invoice sent." : "Nothing to retry."));
  revalidatePath("/autopay");
  back(msg, f);
}

/** "Run today's debits" (demo mode): the daily job's notices and debits, on demand. */
export async function runDueAction() {
  const u = await requirePermission("autopay.manage");
  if ((await getAutopayMode(u.orgId)) !== "demo") back("Live debits are run by Razorpay.");
  const r = await runAutopayDay(u.orgId);
  revalidatePath("/autopay");
  back(`${r.charged} debit${r.charged === 1 ? "" : "s"} collected · ${r.noticed} pre-debit notice${r.noticed === 1 ? "" : "s"} sent.`);
}
