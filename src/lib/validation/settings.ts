import * as z from "zod";
import { indianPhone } from "./common";
import { EXPIRY_CHIPS } from "@/lib/domain/reminders";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());

/** The gym's phone: gyms have landlines too, so 8–12 digits after spaces, dashes and +91 go. */
const gymPhone = z.preprocess(
  blank,
  z
    .string()
    .trim()
    .transform((s) => s.replace(/[\s-]/g, "").replace(/^\+91(?=\d{10}$)/, ""))
    .pipe(z.string().regex(/^\d{8,12}$/, { error: "Enter the gym phone number." }))
    .optional(),
);

const website = z.preprocess(
  blank,
  z
    .string()
    .trim()
    .max(120)
    .transform((s) => s.replace(/^https?:\/\//i, "").replace(/\/+$/, ""))
    .pipe(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i, { error: "Website looks incomplete, e.g. yourgym.in." }))
    .optional(),
);

const instagram = z.preprocess(
  blank,
  z
    .string()
    .trim()
    .max(80)
    .transform((s) => s.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "").replace(/\/+$/, "").replace(/^@/, ""))
    .pipe(z.string().max(60).regex(/^[A-Za-z0-9._]+$/, { error: "Instagram handle: letters, numbers, dots and underscores." }))
    .transform((s) => `@${s}`)
    .optional(),
);

/** Settings › Gym profile: the prototype's eight fields. */
export const gymInput = z.object({
  name: z.string().trim().min(2, { error: "Enter the gym name." }).max(120),
  tagline: opt(80),
  address: opt(300),
  state: opt(60),
  phone: gymPhone,
  email: z.preprocess(blank, z.email({ error: "Enter a valid email." }).max(120).optional()),
  website,
  instagram,
});
export type GymInput = z.infer<typeof gymInput>;

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const gstin = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim().toUpperCase() : v),
  z.string().regex(GSTIN, { error: "That isn't a valid GSTIN." }).optional(),
);

const prefix = z.string().trim().max(10).regex(/^[A-Za-z0-9/-]*$/, { error: "Letters, numbers, - and / only." });

/** Settings › Billing & GST. GST can only be charged with a GSTIN to print on the invoice. */
export const taxInput = z
  .object({
    enabled: z.preprocess((v) => v === "on", z.boolean()),
    rate: z.coerce.number().min(0).max(28),
    type: z.enum(["CGST+SGST", "IGST"]),
    gstin,
    sac: z.preprocess(blank, z.string().trim().regex(/^\d{4,8}$/, { error: "SAC code is 4–8 digits." }).optional()),
    invoicePrefix: z.preprocess((v) => v ?? "", prefix.transform((s) => s.toUpperCase())),
  })
  .superRefine((t, ctx) => {
    if (t.enabled && !t.gstin) ctx.addIssue({ code: "custom", path: ["gstin"], message: "Add your GSTIN to charge GST." });
  });
export type TaxInput = z.infer<typeof taxInput>;

export const numberingInput = z.object({ memberPrefix: prefix, invoicePrefix: prefix, paymentPrefix: prefix });

export const branchInput = z.object({
  name: z.string().trim().min(2, { error: "Enter a name." }).max(80),
  address: z.string().trim().min(3, { error: "Enter the address." }).max(300),
  phone: indianPhone,
  gstin,
});

const arr = (v: unknown) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** Settings › Reminders. Grace days are saved to Setting "access", the rest to "reminders". */
export const reminderInput = z.object({
  expiryDays: z
    .preprocess(arr, z.array(z.coerce.number().int().refine((n) => (EXPIRY_CHIPS as readonly number[]).includes(n), { error: "Pick from the listed days." })))
    .transform((ds) => [...new Set(ds)].sort((a, b) => b - a)),
  dedupDays: z.coerce.number().int().min(0).max(30),
  dueEveryDays: z.coerce.number().int().min(0).max(30),
  defaultMonths: z.coerce.number().int().min(1, { error: "At least 1 month." }).max(60),
  graceDays: z.coerce.number().int().min(0).max(60),
  birthdays: z.preprocess((v) => v === "on", z.boolean()),
});
export type ReminderInput = z.infer<typeof reminderInput>;

/** Settings › Subscription › Renewal reminders. */
export const renewalInput = z.object({
  remindDays: z.coerce.number().pipe(z.literal([14, 7, 3, 1], { error: "Pick 14, 7, 3 or 1 days." })),
  whatsapp: z.preprocess((v) => v === "on", z.boolean()),
  email: z.preprocess((v) => v === "on", z.boolean()),
});
export type RenewalInput = z.infer<typeof renewalInput>;

/** Settings › Subscription › Billing details, printed on FITRON's receipts. Blank fields clear the value. */
export const billingDetailsInput = z.object({
  legalName: opt(120),
  gstin,
  billingEmail: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() || undefined : v), z.email({ error: "Enter a valid email." }).max(120).optional()),
  address: opt(300),
});
export type BillingDetailsInput = z.infer<typeof billingDetailsInput>;

/** Settings › Integrations & AI › UPI autopay. The provider is read-only (Razorpay only). */
export const autopayInput = z.object({
  mode: z.enum(["demo", "live"]),
  retries: z.coerce.number().int({ error: "Retries must be a whole number." }).min(0, { error: "Retries: 0 to 5." }).max(5, { error: "Retries: 0 to 5." }),
  retryGap: z.coerce.number().int({ error: "Days between retries must be a whole number." }).min(1, { error: "Days between retries: 1 to 7." }).max(7, { error: "Days between retries: 1 to 7." }),
});
export type AutopayInput = z.infer<typeof autopayInput>;

/** Settings › Integrations & AI › Fitron AI: three checkboxes. */
export const aiInput = z.object({
  enabled: z.preprocess((v) => v === "on", z.boolean()),
  dailyBrief: z.preprocess((v) => v === "on", z.boolean()),
  autoWinback: z.preprocess((v) => v === "on", z.boolean()),
});
export type AiInput = z.infer<typeof aiInput>;
