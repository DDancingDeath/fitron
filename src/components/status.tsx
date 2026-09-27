import type { MembershipStatus } from "@/lib/domain/membership";
import { Badge, type Tone } from "./ui";

export const STATUS_LABEL: Record<MembershipStatus, string> = {
  ACTIVE: "Active",
  EXPIRING_SOON: "Expiring soon",
  PAYMENT_PENDING: "Payment pending",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
};
const TONE: Record<MembershipStatus, Tone> = {
  ACTIVE: "ok",
  EXPIRING_SOON: "accent",
  PAYMENT_PENDING: "alert",
  EXPIRED: "alert",
  SUSPENDED: "neutral",
};

export const MemberStatus = ({ status }: { status: MembershipStatus }) => <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>;
