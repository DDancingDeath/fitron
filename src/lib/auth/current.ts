import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { gymPlan } from "@/lib/services/saas";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "./session";
import type { Permission } from "./permissions";

export const BRANCH_COOKIE = "fitron_branch";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  /** Set when the user has uploaded a profile photo. */
  photoKey: string | null;
  orgId: string;
  orgName: string;
  role: string;
  perms: ReadonlySet<string>;
  /** Branches this user may work in. */
  branches: { id: string; name: string }[];
  /** The branch picked in the header, or "ALL" for users who can see every branch. */
  branch: string;
  /** Branch ids that queries must be limited to right now. */
  branchIds: string[];
  can: (p: Permission) => boolean;
  /** The gym's free trial or paid plan has ended and nothing is being paid: everything but paying is closed. */
  planBlocked: boolean;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  const user = await db.user.findFirst({
    where: { id: session.userId, active: true, deletedAt: null },
    include: {
      org: true,
      role: { include: { permissions: { include: { permission: true } } } },
      branches: { include: { branch: true } },
    },
  });
  if (!user) return null;

  const perms = new Set(user.role.permissions.map((rp) => rp.permission.key));
  const branches = perms.has("branches.all")
    ? await db.branch.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } })
    : user.branches.map((ub) => ({ id: ub.branch.id, name: ub.branch.name }));

  const picked = (await cookies()).get(BRANCH_COOKIE)?.value;
  const canAll = branches.length > 1;
  const branch =
    picked && branches.some((b) => b.id === picked) ? picked : canAll && (!picked || picked === "ALL") ? "ALL" : (branches[0]?.id ?? "");
  const branchIds = branch === "ALL" ? branches.map((b) => b.id) : [branch];
  const plan = await gymPlan(user.orgId);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    photoKey: user.photoKey,
    orgId: user.orgId,
    orgName: user.org.name,
    role: user.role.name,
    perms,
    branches,
    branch,
    branchIds,
    can: (p) => perms.has(p),
    planBlocked: plan.standing.kind === "LAPSED" && !plan.checking,
  };
});

/** Where a gym whose plan has ended is sent: the plans, to pay. */
export const PLAN_ENDED_PATH = "/plan-ended";
export const PLAN_ENDED = "Your FITRON plan has ended. Your data is safe; choose a plan to continue.";

/**
 * The signed-in user, or off to the login page. A gym whose plan has ended is sent to choose a plan,
 * except where paying happens (`allowBlocked`).
 */
export async function requireUser(opts: { allowBlocked?: boolean } = {}) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.planBlocked && !opts.allowBlocked) redirect(PLAN_ENDED_PATH);
  return u;
}

export async function requirePermission(p: Permission, opts: { allowBlocked?: boolean } = {}) {
  const u = await requireUser(opts);
  if (!u.can(p)) redirect("/dashboard?denied=1");
  return u;
}

/** The branch new records go into: the picked branch, or the first one when "All" is picked. */
export const writeBranch = (u: CurrentUser) => (u.branch === "ALL" ? u.branches[0]?.id : u.branch);
