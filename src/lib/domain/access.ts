import { daysBetween } from "./dates";

/** Gym entry rules, from Setting "access". Money in paise. */
export type AccessRules = {
  blockSuspended: boolean;
  blockExpired: boolean;
  /** Days after expiry a member may still enter. */
  graceDays: number;
  blockDues: boolean;
  /** Dues above this block entry. */
  duesLimit: number;
};

export const DEFAULT_ACCESS: AccessRules = { blockSuspended: true, blockExpired: true, graceDays: 0, blockDues: false, duesLimit: 0 };

const inr = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Why a member can't come in, or null if they can. */
export function entryBlock(m: { suspended: boolean; latestEnd: string | null; outstanding: number }, rules: AccessRules, today: string): string | null {
  if (rules.blockSuspended && m.suspended) return "Membership suspended";
  if (rules.blockExpired) {
    if (!m.latestEnd) return "No membership yet";
    const over = daysBetween(today, m.latestEnd);
    if (over > rules.graceDays) return `Membership ended ${over} day${over === 1 ? "" : "s"} ago`;
  }
  if (rules.blockDues && m.outstanding > rules.duesLimit) return `${inr(m.outstanding)} outstanding`;
  return null;
}
