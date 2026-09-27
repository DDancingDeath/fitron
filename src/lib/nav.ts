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
      { href: "/attendance", label: "Attendance", perm: "attendance.manage" },
      { href: "/leads", label: "Leads", perm: "leads.manage" },
      { href: "/classes", label: "Classes", perm: "classes.manage" },
      { href: "/programs", label: "Workouts & diets", perm: "programs.manage" },
      { href: "/whatsapp", label: "WhatsApp", perm: "whatsapp.send" },
    ],
  },
  {
    group: "Shop",
    items: [
      { href: "/pos", label: "Counter sale", perm: "pos.sell" },
      { href: "/products", label: "Products & stock", perm: "products.manage" },
    ],
  },
  {
    group: "Billing",
    items: [
      { href: "/invoices", label: "Invoices", perm: "invoices.view" },
      { href: "/payments", label: "Payments", perm: "invoices.view" },
      { href: "/receivables", label: "Receivables", perm: "invoices.view" },
      { href: "/autopay", label: "UPI Autopay", perm: "autopay.manage" },
    ],
  },
  {
    group: "Accounts",
    items: [
      { href: "/expenses", label: "Expenses", perm: "expenses.manage" },
      { href: "/accounting", label: "Accounting", perm: "accounting.view" },
      { href: "/reports", label: "Reports", perm: "invoices.view" },
    ],
  },
  {
    group: "Admin",
    items: [
      { href: "/plans", label: "Plans & offers", perm: "plans.manage" },
      { href: "/staff", label: "Staff & roles", perm: "staff.manage" },
      { href: "/audit", label: "Audit log", perm: "audit.view" },
      { href: "/settings", label: "Settings", perm: "settings.manage" },
    ],
  },
];
