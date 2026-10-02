// FITRON's own billing of gyms: the Gym Accounting plan (see pricing.ts), and extra branches
// paid monthly or yearly, plus GST.
import { addDays, membershipEndDate, type IsoDate } from "./dates";
import { findPlan, PLANS } from "./pricing";

/** Branches included before extra-branch payments start. */
export const INCLUDED_BRANCHES = 3;
export const GRACE_DAYS = 7;
export const BRANCH_PRICE = { MONTHLY: 49_900, YEARLY: 4_99_000 } as const; // paise, before GST; "Additional gym branch" add-on
export const SAAS_GST_RATE = 18;
export type Cycle = keyof typeof BRANCH_PRICE;

const withGst = (base: number) => {
  const gst = Math.round((base * SAAS_GST_RATE) / 100);
  return { base, gst, total: base + gst };
};

export const branchPrice = (cycle: Cycle) => withGst(BRANCH_PRICE[cycle]);

/** A Gym Accounting plan's price for one period, plus GST. */
export function planPrice(planKey: string, cycle: Cycle) {
  const p = findPlan(planKey);
  if (!p || p.product !== "GYM_ACCOUNTING") throw new Error(`Not a gym plan: ${planKey}`);
  return withGst(p.price[cycle]);
}

/** A paid period starts the day after the last one ends (or today, if it lapsed) and runs 1 or 12 months. */
export function nextPeriod(cycle: Cycle, today: IsoDate, lastEnd: IsoDate | null) {
  const start = lastEnd && lastEnd >= today ? addDays(lastEnd, 1) : today;
  return { start, end: membershipEndDate(start, cycle === "YEARLY" ? 12 : 1) };
}

export type Standing =
  | { kind: "INCLUDED" }
  | { kind: "PAID"; until: IsoDate }
  | { kind: "GRACE"; until: IsoDate; readOnlyFrom: IsoDate }
  | { kind: "READ_ONLY"; since: IsoDate | null };

/**
 * Where each branch stands. The oldest `included` (3 unless the plan says otherwise) are included; every other branch needs a paid period.
 * After it ends there are 7 days' grace, then the branch is read-only: records stay, but no new
 * members or invoices until it is paid for again.
 */
export function standings(branches: { id: string }[], paidUntil: Map<string, IsoDate>, today: IsoDate, included = INCLUDED_BRANCHES): Map<string, Standing> {
  const out = new Map<string, Standing>();
  branches.forEach((b, i) => {
    if (i < included) return out.set(b.id, { kind: "INCLUDED" });
    const until = paidUntil.get(b.id) ?? null;
    if (until && until >= today) return out.set(b.id, { kind: "PAID", until });
    const readOnlyFrom = until ? addDays(until, GRACE_DAYS + 1) : null;
    if (until && readOnlyFrom! > today) return out.set(b.id, { kind: "GRACE", until, readOnlyFrom: readOnlyFrom! });
    out.set(b.id, { kind: "READ_ONLY", since: readOnlyFrom });
  });
  return out;
}

/** Intra-state supply (same GST state code as Fitron) is CGST + SGST; otherwise IGST. */
export function gstSplit(fitronGstin: string, buyerGstin: string | null | undefined, gst: number) {
  const same = !!buyerGstin && !!fitronGstin && buyerGstin.slice(0, 2) === fitronGstin.slice(0, 2);
  return same ? { type: "CGST_SGST" as const, cgst: Math.floor(gst / 2), sgst: gst - Math.floor(gst / 2), igst: 0 } : { type: "IGST" as const, cgst: 0, sgst: 0, igst: gst };
}

/** What a gym may do on its plan. Gyms set up by hand (no trial date) keep the original rules: no member cap, 3 branches. */
export type GymTerms = { custom: boolean; memberLimit: number | null; includedBranches: number; extraBranches: boolean };

export function gymTerms(org: { plan: string; trialEndsAt: Date | null }): GymTerms {
  if (!org.trialEndsAt) return { custom: true, memberLimit: null, includedBranches: INCLUDED_BRANCHES, extraBranches: true };
  const p = findPlan(org.plan);
  const multi = p?.multiBranch ?? false;
  return { custom: false, memberLimit: p?.memberLimit ?? null, includedBranches: multi ? INCLUDED_BRANCHES : 1, extraBranches: multi };
}

export type PlanStanding =
  | { kind: "CUSTOM" }
  | { kind: "TRIAL"; until: IsoDate }
  | { kind: "PAID"; until: IsoDate }
  | { kind: "GRACE"; until: IsoDate; readOnlyFrom: IsoDate }
  | { kind: "LAPSED"; since: IsoDate };

/**
 * Where a self-signed-up gym stands. The trial runs to its end date; a paid period is followed by
 * 7 days' grace. After that the gym is read-only: everything stays, but no new members or invoices.
 */
export function planStanding(trialEnd: IsoDate | null, paidUntil: IsoDate | null, today: IsoDate): PlanStanding {
  if (!trialEnd) return { kind: "CUSTOM" };
  if (paidUntil && paidUntil >= today) return { kind: "PAID", until: paidUntil };
  if (paidUntil) {
    const readOnlyFrom = addDays(paidUntil, GRACE_DAYS + 1);
    if (readOnlyFrom > today) return { kind: "GRACE", until: paidUntil, readOnlyFrom };
    return { kind: "LAPSED", since: readOnlyFrom };
  }
  if (trialEnd >= today) return { kind: "TRIAL", until: trialEnd };
  return { kind: "LAPSED", since: addDays(trialEnd, 1) };
}

export const planWritable = (s: PlanStanding) => s.kind !== "LAPSED";

/** The Gym Accounting plans as the landing page shows them, with what each costs to pay (GST included). */
export const gymPlanCards = () =>
  PLANS.filter((p) => p.product === "GYM_ACCOUNTING").map((p) => ({
    key: p.key,
    name: p.name,
    price: { MONTHLY: p.price.MONTHLY, YEARLY: p.price.YEARLY },
    total: { MONTHLY: planPrice(p.key, "MONTHLY").total, YEARLY: planPrice(p.key, "YEARLY").total },
    card: p.card!,
  }));
