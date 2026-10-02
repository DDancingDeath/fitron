"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requirePermission } from "@/lib/auth/current";
import { openDoor, removeDevice, saveDevice, syncDevices } from "@/lib/services/biometric";
import { UserError } from "@/lib/services/errors";
import { accessInput } from "@/lib/validation/frontdesk";
import { putSetting } from "@/lib/services/settings";

const back = (params: Record<string, string>): never => redirect(`/settings/devices?${new URLSearchParams(params)}`);

const deviceInput = z.object({
  serial: z.string().trim().regex(/^[A-Za-z0-9_-]{4,40}$/, "Type the serial number from the device's label or its System info screen."),
  name: z.string().trim().min(1, "Give it a name, like Main door").max(40),
  branchId: z.string().min(1, "Pick a branch"),
  relaySeconds: z.coerce.number().int().min(1).max(60),
});

async function run(fn: () => Promise<unknown>, ok: string) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof UserError) back({ error: e.message });
    throw e;
  }
  revalidatePath("/settings/devices");
  back({ saved: ok });
}

export async function saveDeviceAction(fd: FormData) {
  const u = await requirePermission("settings.manage");
  const p = deviceInput.safeParse(Object.fromEntries(fd));
  if (!p.success) back({ error: p.error.issues[0]?.message ?? "Check the form." });
  else await run(() => saveDevice(u, p.data), "Device saved. It picks up its members on its next call in.");
}

export async function removeDeviceAction(id: string) {
  const u = await requirePermission("settings.manage");
  await run(() => removeDevice(u, id), "Device removed.");
}

export async function syncAction() {
  const u = await requirePermission("settings.manage");
  const r = await syncDevices(u.orgId);
  revalidatePath("/settings/devices");
  back({ saved: r.changes ? `${r.changes} change${r.changes === 1 ? "" : "s"} queued for the devices.` : "Devices are already up to date." });
}

export async function openDoorAction(id: string) {
  const u = await requirePermission("attendance.manage");
  await run(() => openDoor(u, id), "Door will open on the device's next call in (within a few seconds).");
}

/** The door rules, edited on this page (the same setting as Settings → Entry rules). */
export async function saveRulesAction(fd: FormData) {
  const u = await requirePermission("settings.manage");
  const p = accessInput.safeParse(Object.fromEntries(fd));
  if (!p.success) back({ error: p.error.issues[0]?.message ?? "Check the rules." });
  else await run(() => putSetting(u, "access", p.data), "Door rules saved. Devices pick them up on their next sync.");
}
