// Fitron's own plan: 3 branches included, extra branches paid monthly or yearly, plus GST.
import { addDays, membershipEndDate, type IsoDate } from "./dates";

export const INCLUDED_BRANCHES = 3;
export const GRACE_DAYS = 7;
export const BRANCH_PRICE = { MONTHLY: 250_000, YEARLY: 800_000 } as const; // paise, before GST
export const SAAS_GST_RATE = 18;
export type Cycle = keyof typeof BRANCH_PRICE;

export function branchPrice(cycle: Cycle) {
  const base = BRANCH_PRICE[cycle];
  const gst = Math.round((base * SAAS_GST_RATE) / 100);
  return { base, gst, total: base + gst };
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
 * Where each branch stands. The oldest 3 are included; every other branch needs a paid period.
 * After it ends there are 7 days' grace, then the branch is read-only: records stay, but no new
 * members or invoices until it is paid for again.
 */
export function standings(branches: { id: string }[], paidUntil: Map<string, IsoDate>, today: IsoDate): Map<string, Standing> {
  const out = new Map<string, Standing>();
  branches.forEach((b, i) => {
    if (i < INCLUDED_BRANCHES) return out.set(b.id, { kind: "INCLUDED" });
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
