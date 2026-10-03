import "server-only";
import { claimSlot } from "./saas";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { UserError } from "./errors";
import type { GymInput, TaxInput } from "@/lib/validation/settings";

type Tx = Prisma.TransactionClient;

export async function getSetting<T>(orgId: string, key: string): Promise<T | null> {
  const s = await db.setting.findUnique({ where: { orgId_key: { orgId, key } } });
  return (s?.value as T) ?? null;
}

/** Settings a Super Admin may change from the app. */
export const EDITABLE_SETTINGS = ["gym", "tax", "numbering", "access", "whatsapp", "reminders", "autopay", "migration", "opening"] as const;
export type EditableSetting = (typeof EDITABLE_SETTINGS)[number];

/** Merges `value` into the setting and audits it, inside the caller's transaction. */
export async function putSettingIn(tx: Tx, u: CurrentUser, key: EditableSetting, value: Record<string, unknown>) {
  const row = await tx.setting.findUnique({ where: { orgId_key: { orgId: u.orgId, key } } });
  const before = (row?.value as Record<string, unknown> | null) ?? null;
  const merged = { ...(before ?? {}), ...value } as Prisma.InputJsonValue;
  await tx.setting.upsert({ where: { orgId_key: { orgId: u.orgId, key } }, create: { orgId: u.orgId, key, value: merged }, update: { value: merged } });
  await audit(tx, { orgId: u.orgId, userId: u.id, action: "setting.update", entity: "Setting", entityId: key, before, after: merged });
  return merged;
}

export async function putSetting(u: CurrentUser, key: EditableSetting, value: Record<string, unknown>) {
  await db.$transaction((tx) => putSettingIn(tx, u, key, value));
}

/** Settings › Gym profile. Shown in the sidebar, on invoices, in WhatsApp messages and Fitron AI. */
export type GymProfile = {
  name: string;
  tagline?: string;
  address?: string;
  state?: string;
  phone?: string;
  email?: string;
  website?: string;
  instagram?: string;
  /** Private storage key of the uploaded logo; the default FITRON logo shows when unset. */
  logoKey?: string | null;
};

/** The gym's profile; the name falls back to the organisation's, so it is never empty. */
export async function getGymProfile(orgId: string): Promise<GymProfile> {
  const s = (await getSetting<Partial<GymProfile>>(orgId, "gym")) ?? {};
  if (s.name?.trim()) return { ...s, name: s.name.trim() };
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } });
  return { ...s, name: org.name };
}

/**
 * Saves the profile fields (keeping the logo) and renames the organisation to match, so the
 * FITRON admin console and emails never show a different name from the invoices.
 */
export async function saveGymProfile(u: CurrentUser, v: GymInput) {
  const value: Record<string, unknown> = {
    name: v.name,
    tagline: v.tagline ?? "",
    address: v.address ?? "",
    state: v.state ?? "",
    phone: v.phone ?? "",
    email: v.email ?? "",
    website: v.website ?? "",
    instagram: v.instagram ?? "",
  };
  await db.$transaction(async (tx) => {
    await putSettingIn(tx, u, "gym", value);
    await tx.organization.update({ where: { id: u.orgId }, data: { name: v.name } });
  });
}

/**
 * Settings › Billing & GST. The invoice prefix has one home (numbering.invoicePrefix), shown here
 * and in the Numbering panel; it is only rewritten (and audited) when it changes.
 */
export async function saveTax(u: CurrentUser, v: TaxInput) {
  const { invoicePrefix, ...tax } = v;
  await db.$transaction(async (tx) => {
    await putSettingIn(tx, u, "tax", { enabled: tax.enabled, rate: tax.rate, type: tax.type, gstin: tax.gstin ?? "", sac: tax.sac ?? "" });
    const numbering = (await tx.setting.findUnique({ where: { orgId_key: { orgId: u.orgId, key: "numbering" } } }))?.value as { invoicePrefix?: string } | null;
    if ((numbering?.invoicePrefix ?? "INV-") !== invoicePrefix) await putSettingIn(tx, u, "numbering", { invoicePrefix });
  });
}

export async function saveBranch(u: CurrentUser, id: string | null, v: { name: string; address: string; phone: string; gstin?: string }) {
  await db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.branch.findFirst({ where: { orgId: u.orgId, id } });
      if (!before) throw new UserError("Branch not found.");
      const after = await tx.branch.update({ where: { id }, data: { ...v, gstin: v.gstin ?? null } });
      await audit(tx, { orgId: u.orgId, userId: u.id, action: "branch.update", entity: "Branch", entityId: id, before, after });
    } else {
      const after = await tx.branch.create({ data: { ...v, gstin: v.gstin ?? null, orgId: u.orgId } });
      await claimSlot(tx, u.orgId, after.id);
      await audit(tx, { orgId: u.orgId, userId: u.id, action: "branch.create", entity: "Branch", entityId: after.id, after });
    }
  });
}
