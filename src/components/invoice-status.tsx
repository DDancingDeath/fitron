import type { InvoiceStatus } from "@/lib/domain/billing";
import { Badge, type Tone } from "./ui";

const LABEL: Record<InvoiceStatus, string> = { PAID: "Paid", PARTIALLY_PAID: "Partly paid", UNPAID: "Unpaid", CANCELLED: "Cancelled" };
const TONE: Record<InvoiceStatus, Tone> = { PAID: "ok", PARTIALLY_PAID: "accent", UNPAID: "alert", CANCELLED: "neutral" };

export const INVOICE_STATUS_LABEL = LABEL;

export function InvoiceStatusBadge({ status, overdueDays = 0 }: { status: InvoiceStatus; overdueDays?: number }) {
  return (
    <span className="inline-flex gap-1">
      <Badge tone={TONE[status]}>{LABEL[status]}</Badge>
      {overdueDays > 0 && <Badge tone="alert">{overdueDays}d overdue</Badge>}
    </span>
  );
}
