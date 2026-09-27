import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { UserError } from "./errors";

export async function getSetting<T>(orgId: string, key: string): Promise<T | null> {
  const s = await db.setting.findUnique({ where: { orgId_key: { orgId, key } } });
  return (s?.value as T) ?? null;
}

/** Settings a Super Admin may change from the app. */
export const EDITABLE_SETTINGS = ["gym", "tax", "numbering", "access", "whatsapp", "autopay"] as const;
export type EditableSetting = (typeof EDITABLE_SETTINGS)[number];

export async function putSetting(u: CurrentUser, key: EditableSetting, value: Record<string, unknown>) {
  const before = await getSetting(u.orgId, key);
  await db.$transaction(async (tx) => {
    const merged = { ...((before as object) ?? {}), ...value } as Prisma.InputJsonValue;
    await tx.setting.upsert({ where: { orgId_key: { orgId: u.orgId, key } }, create: { orgId: u.orgId, key, value: merged }, update: { value: merged } });
    await audit(tx, { orgId: u.orgId, userId: u.id, action: "setting.update", entity: "Setting", entityId: key, before, after: merged });
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
      await audit(tx, { orgId: u.orgId, userId: u.id, action: "branch.create", entity: "Branch", entityId: after.id, after });
    }
  });
}
