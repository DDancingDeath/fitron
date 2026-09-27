import * as z from "zod";
import { optionalText, rupees } from "./common";

export const PLAN_KINDS = ["Membership", "Personal Training", "Add-on"] as const;

export const planInput = z.object({
  name: z.string().trim().min(2, { error: "Enter a plan name." }).max(80),
  kind: z.enum(PLAN_KINDS),
  months: z.coerce.number().int().min(1, { error: "At least 1 month." }).max(60),
  price: rupees,
  regFee: z.preprocess((v) => (v === "" || v == null ? "0" : v), rupees),
  discount: z.preprocess((v) => (v === "" || v == null ? "0" : v), rupees),
  gstApplicable: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  description: optionalText,
  features: z
    .string()
    .optional()
    .transform((s) => (s ?? "").split("\n").map((t) => t.trim()).filter(Boolean)),
});

export type PlanInput = z.infer<typeof planInput>;
