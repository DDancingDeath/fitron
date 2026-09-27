import type { Permission } from "@/lib/auth/permissions";

export type NavItem = { href: string; label: string; perm?: Permission };
export type NavGroup = { group: string; items: NavItem[] };

// Same groups as the prototype. Items appear as each stage of the build lands.
export const NAV: NavGroup[] = [
  {
    group: "Front desk",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/members", label: "Members", perm: "members.view" },
      { href: "/renewals", label: "Renewals", perm: "memberships.renew" },
    ],
  },
  {
    group: "Billing",
    items: [
      { href: "/invoices", label: "Invoices", perm: "invoices.view" },
      { href: "/payments", label: "Payments", perm: "invoices.view" },
      { href: "/receivables", label: "Receivables", perm: "invoices.view" },
    ],
  },
  {
    group: "Admin",
    items: [
      { href: "/plans", label: "Plans & offers", perm: "plans.manage" },
      { href: "/staff", label: "Staff & roles", perm: "staff.manage" },
    ],
  },
];
