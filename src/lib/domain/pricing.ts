// FITRON's public price list, from the pricing page on fitron.in. Paise, before GST.
// The pricing page (public/site) and this file must agree; pricing.test.ts checks the page.

export type Product = "AI_TRAINER" | "GYM_ACCOUNTING" | "PARTNER";
export type Cycle = "MONTHLY" | "YEARLY";

export type PlanDef = {
  key: string;
  product: Product;
  name: string;
  tagline: string;
  price: Record<Cycle, number>;
  /** Active-member cap for gym plans; null = unlimited. */
  memberLimit?: number | null;
  /** Gym plans: more than one branch allowed. */
  multiBranch?: boolean;
  trialDays: number;
};

export const TRIAL_DAYS = 7;

export const PLANS = [
  { key: "ai-pro", product: "AI_TRAINER", name: "AI Pro", tagline: "Structured workouts and personalised fitness guidance.", price: { MONTHLY: 29_900, YEARLY: 1_99_900 }, trialDays: TRIAL_DAYS },
  { key: "ai-premium", product: "AI_TRAINER", name: "AI Premium", tagline: "Advanced AI coaching and long-term progress tracking.", price: { MONTHLY: 49_900, YEARLY: 4_99_900 }, trialDays: TRIAL_DAYS },
  { key: "starter", product: "GYM_ACCOUNTING", name: "Starter", tagline: "For small gyms and fitness studios. Up to 100 active members.", price: { MONTHLY: 99_900, YEARLY: 9_99_000 }, memberLimit: 100, multiBranch: false, trialDays: TRIAL_DAYS },
  { key: "professional", product: "GYM_ACCOUNTING", name: "Professional", tagline: "For growing gyms. Up to 300 active members.", price: { MONTHLY: 1_99_900, YEARLY: 19_99_000 }, memberLimit: 300, multiBranch: false, trialDays: TRIAL_DAYS },
  { key: "enterprise", product: "GYM_ACCOUNTING", name: "Enterprise", tagline: "For large gyms and chains. Unlimited members, multi-branch.", price: { MONTHLY: 3_99_900, YEARLY: 39_99_000 }, memberLimit: null, multiBranch: true, trialDays: TRIAL_DAYS },
  { key: "partner-referral", product: "PARTNER", name: "Referral Partner", tagline: "Promote the AI Trainer and earn 70% of eligible subscriptions.", price: { MONTHLY: 99_900, YEARLY: 9_99_000 }, trialDays: 0 },
  { key: "partner-software", product: "PARTNER", name: "Software Partner", tagline: "Gym Accounting Professional plus 70% AI Trainer revenue share.", price: { MONTHLY: 1_99_900, YEARLY: 19_99_000 }, trialDays: 0 },
  { key: "partner-enterprise", product: "PARTNER", name: "Enterprise Partner", tagline: "Gym Accounting Enterprise plus 70% AI Trainer revenue share.", price: { MONTHLY: 3_99_900, YEARLY: 39_99_000 }, trialDays: 0 },
] as const satisfies readonly PlanDef[];

export type PlanKey = (typeof PLANS)[number]["key"];

export const DEFAULT_PLAN: PlanKey = "professional";

export function findPlan(key: string | null | undefined): PlanDef | undefined {
  return PLANS.find((p) => p.key === key);
}

export const PRODUCT_LABEL: Record<Product, string> = { AI_TRAINER: "AI Trainer", GYM_ACCOUNTING: "Gym Accounting", PARTNER: "Gym Partnership" };

/** "₹1,999" from paise, Indian digit grouping, no paise when whole. */
export function rupeesLabel(paise: number) {
  const r = paise / 100;
  return "₹" + r.toLocaleString("en-IN", { maximumFractionDigits: Number.isInteger(r) ? 0 : 2 });
}
