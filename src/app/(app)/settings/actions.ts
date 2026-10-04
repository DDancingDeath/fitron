"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireFeature, requirePermission } from "@/lib/auth/current";
import { putSetting, saveBranch, saveGymProfile, saveTax as saveTaxSettings } from "@/lib/services/settings";
import { getWaSettings, sendTest, setLinked } from "@/lib/services/whatsapp";
import { connectorLogout, connectorStatus, providerReady } from "@/lib/integrations/whatsapp";
import { removeGymLogo, setGymLogo } from "@/lib/services/gym-logo";
import { aiInput, autopayInput, branchInput, gymInput, numberingInput, privacyInput, reminderInput, taxInput } from "@/lib/validation/settings";
import { checkAutopayConnection } from "@/lib/services/autopay";
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

/** Settings › Privacy & DPDP (Setting `privacy`, audited). */
export async function savePrivacy(fd: FormData) {
  const u = await requirePermission("settings.manage");
  await save(privacyInput, fd, "privacy", async (v) => {
    await putSetting(u, "privacy", { officer: v.officer, email: v.email, phone: v.phone ?? "", retainMonths: v.retainMonths });
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

/** Settings › Integrations & AI › UPI autopay: mode, retries and the gap between them (the provider is Razorpay only). */
export async function saveAutopay(fd: FormData) {
  const u = await requirePermission("settings.manage");
  await save(autopayInput, fd, "autopay", async (v) => {
    await putSetting(u, "autopay", v);
  });
}

/** "Test connection": one audited check against Razorpay with the server keys; demo mode has nothing to test. */
export async function testAutopayConnection() {
  const u = await requirePermission("settings.manage");
  if (!u.has("autopay")) back({ error: "UPI autopay is on the Professional plan.", section: "autopay" });
  await checkAutopayConnection(u);
  revalidatePath("/settings");
  back({ saved: "autopay" });
}

/** Settings › Integrations & AI › Fitron AI: the three switches drive the sidebar, the dashboard brief and win-back drafts. */
export async function saveAi(fd: FormData) {
  const u = await requirePermission("settings.manage");
  if (!u.has("ai")) back({ error: "Fitron AI is on the Professional plan.", section: "ai" });
  await save(aiInput, fd, "ai", async (v) => {
    await putSetting(u, "ai", v);
  });
}

/** Linking, testing and unlinking WhatsApp: a Super Admin on a plan with WhatsApp. */
async function waUser() {
  await requirePermission("settings.manage");
  return requireFeature("whatsapp");
}
const waBack = (params: Record<string, string>) => back({ tab: "wa", ...params });

/** "Send test" on the Linked WhatsApp card: one message to the gym's own number. */
export async function sendTestAction() {
  const u = await waUser();
  let msg: Awaited<ReturnType<typeof sendTest>>;
  try {
    msg = await sendTest(u);
  } catch (e) {
    if (e instanceof UserError) waBack({ error: e.message });
    throw e;
  }
  revalidatePath("/whatsapp");
  if (msg.status === "Failed") waBack({ error: `Test failed: ${msg.error}` });
  waBack({ msg: msg.status === "Queued" ? "Test message queued on your linked WhatsApp." : msg.status === "Logged" ? "Demo mode: test message logged, not sent." : "Test message sent." });
}

/** "Unlink": the connector signs out and messages are logged until the gym links again. */
export async function unlinkAction() {
  const u = await waUser();
  if ((await getWaSettings(u.orgId)).mode === "connector" && !providerReady("connector")) await connectorLogout();
  await setLinked(u, null, "demo");
  revalidatePath("/", "layout");
  waBack({ msg: "WhatsApp unlinked." });
}

/** "Simulate instead" in the Link WhatsApp dialog: demo mode, for gyms without a connector. */
export async function simulateLinkAction() {
  const u = await waUser();
  await setLinked(u, null, "demo");
  revalidatePath("/", "layout");
  waBack({ msg: "Demo mode: messages are logged, not sent." });
}

export type LinkStatus = { state: "offline" | "waiting" | "qr" | "ready"; qr?: string; number?: string; text: string };
const WAITING = "Waiting for the connector… checking every few seconds";

/**
 * Polled by the Link WhatsApp dialog: the connector's state and QR code. Once the phone is linked,
 * the gym is marked linked (mode connector) and the dialog closes.
 */
export async function linkStatusAction(): Promise<LinkStatus> {
  const u = await waUser();
  const missing = providerReady("connector");
  if (missing) return { state: "offline", text: `${missing} ${WAITING}` };
  let st: Awaited<ReturnType<typeof connectorStatus>>;
  try {
    st = await connectorStatus();
  } catch {
    return { state: "offline", text: WAITING };
  }
  if (st.state === "ready") {
    const number = (st.number ?? "").replace(/\D/g, "");
    const s = await getWaSettings(u.orgId);
    if (!(s.mode === "connector" && s.linked?.number === number)) {
      let host = "gym PC";
      try {
        host = new URL(process.env.WA_CONNECTOR_URL ?? "").host || host;
      } catch {
        // Keep the fallback.
      }
      await setLinked(u, { number, device: `Fitron connector · ${host}`, at: new Date().toISOString() }, "connector");
      revalidatePath("/", "layout");
    }
    return { state: "ready", number, text: "Linked." };
  }
  if (st.qr) return { state: "qr", qr: st.qr, text: "" };
  return { state: "waiting", text: st.state === "authenticating" ? "Scanned. Finishing link…" : "Connector is starting WhatsApp…" };
}
