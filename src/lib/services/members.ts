import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { writeBranch } from "@/lib/auth/current";
import { membershipStatus, type MembershipStatus } from "@/lib/domain/membership";
import { invoiceState } from "@/lib/domain/billing";
import type { MemberInput } from "@/lib/validation/member";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "./audit";
import { nextNumber } from "./sequence";
import { isUniqueViolation, UserError } from "./errors";
import { todayIso, toIso, fromIso } from "./time";
import { getSetting } from "./settings";
import { markLeadWon } from "./leads";
import { eraseBiometrics } from "./biometric";

/** Members a user may see: their branches, and only assigned members for trainers. */
export function memberScope(u: CurrentUser): Prisma.MemberWhereInput {
  return {
    orgId: u.orgId,
    branchId: { in: u.branchIds },
    deletedAt: null,
    ...(u.can("members.all") ? {} : { trainerId: u.id }),
  };
}

export type MemberRow = {
  id: string;
  code: string;
  name: string;
  phone: string;
  gender: string;
  area: string | null;
  branchId: string;
  planName: string | null;
  latestEnd: string | null;
  outstanding: number;
  status: MembershipStatus;
};

/** Latest end date, current plan and outstanding balance for each member, computed (rules 3, 4, 11). */
export async function summarize(memberIds: string[], today = todayIso()) {
  const [memberships, invoices] = await Promise.all([
    db.membership.findMany({
      where: { memberId: { in: memberIds }, status: "VALID" },
      select: { memberId: true, startDate: true, endDate: true, plan: { select: { name: true } } },
      orderBy: { startDate: "asc" },
    }),
    db.invoice.findMany({
      where: { memberId: { in: memberIds }, status: "ISSUED" },
      select: { memberId: true, total: true, dueDate: true, payments: { select: { amount: true, status: true } } },
    }),
  ]);
  const out = new Map<string, { latestEnd: string | null; planName: string | null; outstanding: number }>();
  for (const id of memberIds) out.set(id, { latestEnd: null, planName: null, outstanding: 0 });
  const covering = new Set<string>();
  for (const m of memberships) {
    const s = out.get(m.memberId)!;
    const start = toIso(m.startDate);
    const end = toIso(m.endDate);
    // Current plan: the membership covering today; otherwise the one ending last.
    if (start <= today && end >= today) {
      s.planName = m.plan.name;
      covering.add(m.memberId);
    } else if (!covering.has(m.memberId) && (!s.latestEnd || end >= s.latestEnd)) {
      s.planName = m.plan.name;
    }
    if (!s.latestEnd || end > s.latestEnd) s.latestEnd = end;
  }
  for (const inv of invoices) {
    const st = invoiceState(
      { total: inv.total, cancelled: false, dueDate: toIso(inv.dueDate) },
      inv.payments as { amount: number; status: "SUCCESS" | "REVERSED" }[],
      today,
    );
    out.get(inv.memberId)!.outstanding += st.balance;
  }
  return out;
}

export async function listMembers(
  u: CurrentUser,
  f: { q?: string; status?: string; gender?: string; plan?: string; page?: number; all?: boolean },
) {
  const q = f.q?.trim();
  const where: Prisma.MemberWhereInput = {
    ...memberScope(u),
    walkIn: false,
    ...(f.gender ? { gender: f.gender } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q.replace(/\s/g, "") } },
            { code: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const members = await db.member.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, name: true, phone: true, gender: true, area: true, branchId: true, suspended: true },
  });
  const today = todayIso();
  const sums = await summarize(members.map((m) => m.id), today);
  let rows: MemberRow[] = members.map((m) => {
    const s = sums.get(m.id)!;
    return {
      ...m,
      ...s,
      status: membershipStatus({ suspended: m.suspended, latestEnd: s.latestEnd, outstanding: s.outstanding, today }),
    };
  });
  if (f.status) rows = rows.filter((r) => r.status === f.status);
  if (f.plan) rows = rows.filter((r) => r.planName === f.plan);
  const counts = rows.reduce<Record<string, number>>((c, r) => ((c[r.status] = (c[r.status] ?? 0) + 1), c), {});
  const pageSize = f.all ? Math.max(1, rows.length) : 50;
  const page = Math.max(1, f.page ?? 1);
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize, counts };
}

export async function getMember(u: CurrentUser, id: string) {
  const m = await db.member.findFirst({ where: { ...memberScope(u), id }, include: { branch: true } });
  if (!m) return null;
  const today = todayIso();
  const s = (await summarize([m.id], today)).get(m.id)!;
  const trainer = m.trainerId ? await db.user.findUnique({ where: { id: m.trainerId }, select: { name: true } }) : null;
  return {
    ...m,
    ...s,
    trainerName: trainer?.name ?? null,
    status: membershipStatus({ suspended: m.suspended, latestEnd: s.latestEnd, outstanding: s.outstanding, today }),
  };
}

const toData = (i: MemberInput) => ({
  ...i,
  dob: i.dob ? fromIso(i.dob) : null,
  whatsapp: i.whatsapp ?? null,
  email: i.email ?? null,
  trainerId: i.trainerId ?? null,
});

async function assertPhoneFree(tx: Prisma.TransactionClient, orgId: string, phone: string, exceptId?: string) {
  const clash = await tx.member.findFirst({
    where: { orgId, phone, deletedAt: null, walkIn: false, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { code: true, name: true },
  });
  if (clash) throw new UserError(`This phone number already belongs to ${clash.name} (${clash.code}).`, "phone");
}

export async function createMember(u: CurrentUser, input: MemberInput, opts: { leadId?: string } = {}) {
  const branchId = writeBranch(u);
  if (!branchId) throw new UserError("Pick a branch first.");
  const prefix = (await getSetting<{ memberPrefix?: string }>(u.orgId, "numbering"))?.memberPrefix ?? "FT-";
  try {
    return await db.$transaction(async (tx) => {
      await assertPhoneFree(tx, u.orgId, input.phone);
      const n = await nextNumber(tx, u.orgId, "member");
      const m = await tx.member.create({
        data: { ...toData(input), code: `${prefix}${n}`, orgId: u.orgId, branchId, createdById: u.id },
      });
      await audit(tx, { orgId: u.orgId, userId: u.id, action: "member.create", entity: "Member", entityId: m.id, after: m });
      if (opts.leadId) await markLeadWon(tx, u, opts.leadId, m.id);
      return m;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError("This phone number is already registered.", "phone");
    throw e;
  }
}

export async function updateMember(u: CurrentUser, id: string, input: MemberInput) {
  const before = await db.member.findFirst({ where: { ...memberScope(u), id } });
  if (!before) throw new UserError("Member not found.");
  try {
    return await db.$transaction(async (tx) => {
      await assertPhoneFree(tx, u.orgId, input.phone, id);
      const after = await tx.member.update({ where: { id }, data: toData(input) });
      await audit(tx, { orgId: u.orgId, userId: u.id, action: "member.update", entity: "Member", entityId: id, before, after });
      return after;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError("This phone number is already registered.", "phone");
    throw e;
  }
}

export async function setSuspended(u: CurrentUser, id: string, suspended: boolean) {
  const before = await db.member.findFirst({ where: { ...memberScope(u), id } });
  if (!before) throw new UserError("Member not found.");
  await db.$transaction(async (tx) => {
    const after = await tx.member.update({ where: { id }, data: { suspended } });
    await audit(tx, { orgId: u.orgId, userId: u.id, action: suspended ? "member.suspend" : "member.resume", entity: "Member", entityId: id, before, after });
  });
}

/** Rule 9: members are soft-deleted; their financial history stays. */
export async function deleteMember(u: CurrentUser, id: string) {
  const before = await db.member.findFirst({ where: { ...memberScope(u), id } });
  if (!before) throw new UserError("Member not found.");
  await db.$transaction(async (tx) => {
    // Biometric data doesn't outlive the member (DPDP).
    await eraseBiometrics(u, id, tx);
    const after = await tx.member.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, { orgId: u.orgId, userId: u.id, action: "member.delete", entity: "Member", entityId: id, before, after });
  });
}

/** Options for a member picker: "PHG-1001 · Asha Verma". */
export async function memberOptions(u: CurrentUser) {
  const ms = await db.member.findMany({ where: { ...memberScope(u), walkIn: false }, select: { id: true, code: true, name: true, phone: true }, orderBy: { name: "asc" } });
  return ms.map((m) => ({ id: m.id, label: `${m.code} · ${m.name} · ${m.phone}` }));
}

/** Resolves what was typed in a member picker (the option label, or just the member ID). */
export async function resolveMemberRef(u: CurrentUser, text: string) {
  const code = text.trim().split(/\s+/)[0] ?? "";
  if (!code) return null;
  return db.member.findFirst({ where: { ...memberScope(u), walkIn: false, code: { equals: code, mode: "insensitive" } }, select: { id: true, name: true } });
}
