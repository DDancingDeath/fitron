import type { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_ROLES, PERMISSIONS } from "../src/lib/auth/permissions";

/** Creates any missing permissions and default roles. Safe to run repeatedly; never removes a grant. */
export async function ensureRoles(db: PrismaClient) {
  for (const key of Object.keys(PERMISSIONS)) {
    await db.permission.upsert({ where: { key }, create: { key }, update: {} });
  }
  const perms = new Map((await db.permission.findMany()).map((p) => [p.key, p.id]));
  const roles = new Map<string, string>();
  for (const [name, keys] of Object.entries(DEFAULT_ROLES)) {
    const role = await db.role.upsert({ where: { name }, create: { name }, update: {} });
    roles.set(name, role.id);
    await db.rolePermission.createMany({
      data: keys.map((k) => ({ roleId: role.id, permissionId: perms.get(k)! })),
      skipDuplicates: true,
    });
  }
  return roles;
}
