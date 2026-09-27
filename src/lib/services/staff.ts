import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { hashPassword } from "@/lib/auth/password";
import type { StaffInput } from "@/lib/validation/staff";
import { audit } from "./audit";
import { isUniqueViolation, UserError } from "./errors";

const safe = <T extends { passwordHash?: string }>(u: T) => {
  const { passwordHash: _, ...rest } = u;
  void _;
  return rest;
};

export const listStaff = (u: CurrentUser) =>
  db.user.findMany({
    where: { orgId: u.orgId, deletedAt: null },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      shift: true,
      ptRate: true,
      active: true,
      lastLoginAt: true,
      role: { select: { id: true, name: true } },
      branches: { select: { branch: { select: { id: true, name: true } } } },
    },
  });

export const listTrainers = (u: CurrentUser) =>
  db.user.findMany({
    where: { orgId: u.orgId, deletedAt: null, active: true, role: { name: "Trainer" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

export const listRoles = () =>
  db.role.findMany({ orderBy: { name: "asc" }, include: { permissions: { include: { permission: true } } } });

export async function getStaff(u: CurrentUser, id: string) {
  return db.user.findFirst({
    where: { orgId: u.orgId, id, deletedAt: null },
    select: { id: true, name: true, email: true, phone: true, shift: true, ptRate: true, active: true, roleId: true, branches: { select: { branchId: true } } },
  });
}

async function checkBranches(u: CurrentUser, ids: string[]) {
  const n = await db.branch.count({ where: { orgId: u.orgId, id: { in: ids } } });
  if (n !== ids.length) throw new UserError("Pick branches from this gym.", "branchIds");
}

export async function createStaff(u: CurrentUser, input: StaffInput) {
  if (!input.password) throw new UserError("Set a first password.", "password");
  await checkBranches(u, input.branchIds);
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          orgId: u.orgId,
          name: input.name,
          email: input.email,
          phone: input.phone,
          roleId: input.roleId,
          shift: input.shift ?? null,
          ptRate: input.ptRate,
          passwordHash,
          branches: { create: input.branchIds.map((branchId) => ({ branchId })) },
        },
      });
      await audit(tx, { orgId: u.orgId, userId: u.id, action: "staff.create", entity: "User", entityId: user.id, after: safe(user) });
      return user;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError("Someone already uses this email.", "email");
    throw e;
  }
}

export async function updateStaff(u: CurrentUser, id: string, input: StaffInput) {
  const before = await db.user.findFirst({ where: { orgId: u.orgId, id, deletedAt: null } });
  if (!before) throw new UserError("Staff member not found.");
  await checkBranches(u, input.branchIds);
  if (id === u.id && input.roleId !== before.roleId) throw new UserError("You can't change your own role.", "roleId");
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  try {
    await db.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          roleId: input.roleId,
          shift: input.shift ?? null,
          ptRate: input.ptRate,
          ...(passwordHash ? { passwordHash } : {}),
        },
      });
      await tx.userBranch.deleteMany({ where: { userId: id } });
      await tx.userBranch.createMany({ data: input.branchIds.map((branchId) => ({ userId: id, branchId })) });
      // A password reset signs the person out everywhere.
      if (passwordHash) await tx.session.deleteMany({ where: { userId: id } });
      await audit(tx, { orgId: u.orgId, userId: u.id, action: "staff.update", entity: "User", entityId: id, before: safe(before), after: { ...safe(after), branchIds: input.branchIds, passwordReset: !!passwordHash } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError("Someone already uses this email.", "email");
    throw e;
  }
}

export async function setStaffActive(u: CurrentUser, id: string, active: boolean) {
  if (id === u.id) throw new UserError("You can't deactivate yourself.");
  const before = await db.user.findFirst({ where: { orgId: u.orgId, id, deletedAt: null } });
  if (!before) throw new UserError("Staff member not found.");
  await db.$transaction(async (tx) => {
    const after = await tx.user.update({ where: { id }, data: { active } });
    if (!active) await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, { orgId: u.orgId, userId: u.id, action: active ? "staff.activate" : "staff.deactivate", entity: "User", entityId: id, before: safe(before), after: safe(after) });
  });
}
