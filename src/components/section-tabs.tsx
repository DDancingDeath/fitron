import Link from "next/link";
import type { CurrentUser } from "@/lib/auth/current";
import type { Permission } from "@/lib/auth/permissions";
import { cx } from "./ui";

type Tab = { href: string; label: string; perm?: Permission };

/** Underlined tabs across the top of a section, as in the prototype's Accounting and Settings. */
export function SectionTabs({ u, tabs, current }: { u: CurrentUser; tabs: Tab[]; current: string }) {
  const shown = tabs.filter((t) => !t.perm || u.can(t.perm));
  if (shown.length < 2) return null;
  return (
    <nav className="mb-6 flex flex-wrap gap-1">
      {shown.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={cx("border-b-2 px-3 py-2 text-[15px]", t.href === current ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export const ACCOUNTING_TABS: Tab[] = [
  { href: "/accounting", label: "Profit & loss", perm: "accounting.view" },
  { href: "/purchases", label: "Purchases", perm: "purchases.manage" },
  { href: "/assets", label: "Fixed assets", perm: "assets.manage" },
  { href: "/accounting?tab=ledger", label: "Ledgers", perm: "accounting.view" },
  { href: "/accounting?tab=close", label: "Month-end closing", perm: "accounting.view" },
];

export const SETTINGS_TABS: Tab[] = [
  { href: "/settings", label: "Gym profile" },
  { href: "/settings?tab=billing", label: "Billing & GST" },
  { href: "/settings?tab=reminders", label: "Reminders" },
  { href: "/settings?tab=wa", label: "WhatsApp" },
  { href: "/settings?tab=int", label: "Integrations & AI" },
  { href: "/settings/import", label: "Migrate & import", perm: "import.run" },
  { href: "/settings/jobs", label: "Daily jobs" },
  { href: "/settings/billing", label: "Subscription" },
  { href: "/settings?tab=branches", label: "Branches" },
  { href: "/staff?tab=perm", label: "Roles & access", perm: "staff.manage" },
];
