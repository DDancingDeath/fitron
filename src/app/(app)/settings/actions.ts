"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requirePermission } from "@/lib/auth/current";
import { putSetting, saveBranch, saveGymProfile, saveTax as saveTaxSettings } from "@/lib/services/settings";
import { removeGymLogo, setGymLogo } from "@/lib/services/gym-logo";
import { branchInput, gymInput, numberingInput, taxInput } from "@/lib/validation/settings";
import { accessInput } from "@/lib/validation/frontdesk";
import { UserError } from "@/lib/services/errors";
import { ensureTrainerCode } from "@/lib/services/trainer-gym";
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

const waInput = z.object({
  mode: z.enum(["demo", "cloud", "connector"]),
  dedupDays: z.coerce.number().int().min(0).max(30),
  expiryDays: z.preprocess((v) => (Array.isArray(v) ? v : v == null ? [] : [v]), z.array(z.coerce.number().int().refine((n) => [0, 1, 3, 7].includes(n)))),
  dueEveryDays: z.coerce.number().int().min(0).max(30),
  birthdays: z.preprocess((v) => v === "on", z.boolean()),
});

export async function saveWhatsApp(fd: FormData) {
  const u = await requirePermission("settings.manage");
  const raw = { ...Object.fromEntries(fd), expiryDays: fd.getAll("expiryDays") };
  const parsed = waInput.safeParse(raw);
  if (!parsed.success) back({ error: firstError(parsed.error), section: "whatsapp" });
  await putSetting(u, "whatsapp", parsed.data!);
  revalidatePath("/", "layout");
  back({ saved: "whatsapp" });
}

export async function saveAutopay(fd: FormData) {
  const u = await requirePermission("settings.manage");
  await save(z.object({ mode: z.enum(["demo", "live"]) }), fd, "autopay", async (v) => {
    await putSetting(u, "autopay", v);
  });
}
