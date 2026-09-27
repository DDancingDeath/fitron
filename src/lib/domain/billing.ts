import { daysBetween, type IsoDate } from "./dates";

// Invoice maths. All amounts are integer paise.

export type InvoiceLine = {
  qty: number;
  rate: number;
  discount: number;
  /** GST percent, e.g. 18 */
  taxRate: number;
};

export type InvoiceTotals = { subtotal: number; discount: number; tax: number; total: number };

/** Tax is charged on (qty × rate − discount) per line and rounded once on the invoice. */
export function invoiceTotals(lines: InvoiceLine[]): InvoiceTotals {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const l of lines) {
    const gross = l.qty * l.rate;
    subtotal += gross;
    discount += l.discount;
    tax += ((gross - l.discount) * l.taxRate) / 100;
  }
  tax = Math.round(tax);
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

export type PaymentLike = { amount: number; status: "SUCCESS" | "REVERSED" };

export type InvoiceStatus = "CANCELLED" | "PAID" | "PARTIALLY_PAID" | "UNPAID";

export type InvoiceState = {
  paid: number;
  balance: number;
  status: InvoiceStatus;
  /** Days past the due date while a balance remains; 0 otherwise. */
  overdueDays: number;
};

/**
 * Paid state is never stored (rule 3): balance = total − successful payments.
 * A cancelled invoice has no balance.
 */
export function invoiceState(
  invoice: { total: number; cancelled: boolean; dueDate: IsoDate },
  payments: PaymentLike[],
  today: IsoDate,
): InvoiceState {
  const paid = payments.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.amount, 0);
  const balance = invoice.cancelled ? 0 : Math.max(0, invoice.total - paid);
  const status: InvoiceStatus = invoice.cancelled
    ? "CANCELLED"
    : balance <= 0
      ? "PAID"
      : paid > 0
        ? "PARTIALLY_PAID"
        : "UNPAID";
  const overdueDays = balance > 0 ? Math.max(0, daysBetween(today, invoice.dueDate)) : 0;
  return { paid, balance, status, overdueDays };
}

/** Formats paise as Indian rupees, e.g. 123456789 → "₹12,34,567.89". */
export const formatInr = (paise: number): string =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
