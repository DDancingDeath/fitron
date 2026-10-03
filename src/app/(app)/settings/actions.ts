"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requirePermission } from "@/lib/auth/current";
import { putSetting, saveBranch, saveGymProfile, saveTax as saveTaxSettings } from "@/lib/services/settings";
import { removeGymLogo, setGymLogo } from "@/lib/services/gym-logo";
import { branchInput, gymInput, numberingInput, reminderInput, taxInput } from "@/lib/validation/settings";
import { accessInput } from "@/lib/validation/frontdesk";
import { UserError } from "@/lib/services/errors";
import { ensureTrainerCode } from "@/lib/services/trainer-gym";
import { saveReminderSettings } from "@/lib/services/reminders";
import { simpleAction } from "@/lib/form-action";
import type { FormState } from "@/lib/validation/common";

const back = (params: Record<string, string>) => redirect(`/settings?${new URLSearchParams(params)}`);
const firstError = (e: z.ZodError) => e.issues.map((i) => `${String(i.path[0] ?? "")}: ${i.message}`)[0] ?? "Check the form.";

async function save<T extends z.ZodType>(schema: T, fd: FormData, section: string, fn: (v: z.infer<T>) => Promise<void>) {
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) back({ error: firstError(parsed.error), section });
  try {
    await fn(parsed.data as z.infer<T>);
  } catch (e) {
    if (e instanceof UserError) back({ error: e.message, section });
    throw e;
  }
  revalidatePath("/", "layout");
  back({ saved: section });
}

export async function saveGym(fd: FormData) {
  const u = await requirePermission("settings.manage");
  await save(gymInput, fd, "gym", async (v) => {
    await saveGymProfile(u, v);
  });
}

/** Uploads a new gym logo (a PNG from the crop dialog), or goes back to the default with intent=remove. */
export async function changeLogo(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePermission("settings.manage");
  const state =
    fd.get("intent") === "remove"
      ? await simpleAction(() => removeGymLogo(u), "Logo reset to default.")
      : await simpleAction(() => setGymLogo(u, fd.get("logo") as File), "Logo updated.");
  if (state?.ok) revalidatePath("/", "layout");
  return state;
}

/** The gym's AI Trainer code for the Gym Partnership, made once. */
export async function makeTrainerCode() {
  const u = await requirePermission("settings.manage");
  await ensureTrainerCode(u.orgId);
  revalidatePath("/settings");
  back({ saved: "gym" });
}

export async function saveTax(fd: FormData) {
  const u = await requirePermission("settings.manage");
  await save(taxInput, fd, "tax", async (v) => {
    await saveTaxSettings(u, v);
  });
}

export async function saveNumbering(fd: FormData) {
  const u = await requirePermission("settings.manage");
  await save(numberingInput, fd, "numbering", async (v) => {
    await putSetting(u, "numbering", v);
  });
}

export async function saveBranchAction(id: string | null, fd: FormData) {
  const u = await requirePermission("settings.manage");
  await save(branchInput, fd, "branches", async (v) => {
    await saveBranch(u, id, v);
  });
}

export async function saveAccess(fd: FormData) {
  const u = await requirePermission("settings.manage");
  await save(accessInput, fd, "access", async (v) => {
    await putSetting(u, "access", v);
  });
}

const waInput = z.object({ mode: z.enum(["demo", "cloud", "connector"]) });

/** Settings › WhatsApp: only how messages go out. The reminder schedule is saved from the Reminders tab. */
export async function saveWhatsApp(fd: FormData) {
  const u = await requirePermission("settings.manage");
  await save(waInput, fd, "whatsapp", async (v) => {
    await putSetting(u, "whatsapp", v);
  });
}

/** Settings › Reminders: every field drives the daily jobs, the sell form and door access for real. */
export async function saveReminders(fd: FormData) {
  const u = await requirePermission("settings.manage");
  const raw = { ...Object.fromEntries(fd), expiryDays: fd.getAll("expiryDays") };
  const parsed = reminderInput.safeParse(raw);
  if (!parsed.success) back({ error: firstError(parsed.error), section: "reminders" });
  await saveReminderSettings(u, parsed.data!);
  revalidatePath("/", "layout");
  back({ saved: "reminders" });
}

export async function saveAutopay(fd: FormData) {
  const u = await requirePermission("settings.manage");
  await save(z.object({ mode: z.enum(["demo", "live"]) }), fd, "autopay", async (v) => {
    await putSetting(u, "autopay", v);
  });
}
