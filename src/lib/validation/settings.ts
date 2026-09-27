import * as z from "zod";
import { indianPhone, optionalText } from "./common";

export const gymInput = z.object({ name: z.string().trim().min(2).max(120) });

export const taxInput = z.object({
  enabled: z.preprocess((v) => v === "on", z.boolean()),
  rate: z.coerce.number().min(0).max(28),
  type: z.enum(["CGST+SGST", "IGST"]),
  sac: optionalText,
});

const prefix = z.string().trim().max(10).regex(/^[A-Za-z0-9/-]*$/, { error: "Letters, numbers, - and / only." });
export const numberingInput = z.object({ memberPrefix: prefix, invoicePrefix: prefix, paymentPrefix: prefix });

export const branchInput = z.object({
  name: z.string().trim().min(2, { error: "Enter a name." }).max(80),
  address: z.string().trim().min(3, { error: "Enter the address." }).max(300),
  phone: indianPhone,
  gstin: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim().toUpperCase() : v),
    z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, { error: "That isn't a valid GSTIN." }).optional(),
  ),
});
