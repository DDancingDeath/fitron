import "server-only";
import { db } from "@/lib/db";

export async function getSetting<T>(orgId: string, key: string): Promise<T | null> {
  const s = await db.setting.findUnique({ where: { orgId_key: { orgId, key } } });
  return (s?.value as T) ?? null;
}
