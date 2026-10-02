import type { Permission } from "@/lib/auth/permissions";
import type { NavCounts } from "@/lib/services/shell";

export type NavIcon =
  | "dashboard"
  | "members"
  | "leads"
  | "renewals"
  | "attendance"
  | "classes"
  | "invoices"
  | "payments"
  | "autopay"
  | "receivables"
  | "pos"
  | "expenses"
  | "accounting"
  | "reports"
  | "ai"
  | "whatsapp"
  | "programs"
  | "notifications"
  | "plans"
  | "biometric"
  | "staff"
  | "audit"
  | "settings";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  perm?: Permission;
  /** Other pages that belong to this section, so it stays highlighted there. */
  also?: string[];
  /** Which sidebar number to show (the prototype's badge counts). */
  count?: keyof NavCounts;
  badge?: number;
};
export type NavGroup = { group: string; items: NavItem[] };

// The prototype's sidebar (prototype/fitron-core.js): same groups, labels, icons and order.
export const NAV: NavGroup[] = [
  {
    group: "Front desk",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/members", label: "Members", icon: "members", perm: "members.view" },
      { href: "/leads", label: "Leads & trials", icon: "leads", perm: "leads.manage", count: "leads" },
      { href: "/renewals", label: "Renewals", icon: "renewals", perm: "memberships.renew", count: "renewals" },
      { href: "/attendance", label: "Attendance", icon: "attendance", perm: "attendance.manage" },
      { href: "/classes", label: "Classes", icon: "classes", perm: "classes.manage" },
    ],
  },
  {
    group: "Billing",
    items: [
      { href: "/invoices", label: "Invoices", icon: "invoices", perm: "invoices.view" },
      { href: "/payments", label: "Payments", icon: "payments", perm: "invoices.view" },
      { href: "/autopay", label: "UPI autopay", icon: "autopay", perm: "autopay.manage" },
      { href: "/receivables", label: "Receivables", icon: "receivables", perm: "invoices.view", count: "receivables" },
      { href: "/pos", label: "POS & inventory", icon: "pos", perm: "pos.sell", also: ["/products"] },
    ],
  },
  {
    group: "Accounts",
    items: [
      { href: "/expenses", label: "Expenses", icon: "expenses", perm: "expenses.manage" },
      { href: "/accounting", label: "Accounting", icon: "accounting", perm: "accounting.view", also: ["/purchases", "/assets"] },
      { href: "/reports", label: "Reports", icon: "reports", perm: "invoices.view" },
    ],
  },
  {
    group: "Engage",
    items: [
      { href: "/ai", label: "Fitron AI", icon: "ai", perm: "ai.use", count: "ai" },
      { href: "/whatsapp", label: "WhatsApp", icon: "whatsapp", perm: "whatsapp.send" },
      { href: "/programs", label: "Workouts & diet", icon: "programs", perm: "programs.manage" },
      { href: "/notifications", label: "Notifications", icon: "notifications", count: "notifications" },
    ],
  },
  {
    group: "Admin",
    items: [
      { href: "/plans", label: "Plans & offers", icon: "plans", perm: "plans.manage" },
      { href: "/settings/devices", label: "Biometric & doors", icon: "biometric", perm: "settings.manage" },
      { href: "/staff", label: "Staff & roles", icon: "staff", perm: "staff.manage" },
      { href: "/audit", label: "Audit log", icon: "audit", perm: "audit.view" },
      { href: "/settings", label: "Settings", icon: "settings", perm: "settings.manage" },
    ],
  },
];
