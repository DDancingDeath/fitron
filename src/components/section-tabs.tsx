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
    <nav className="-mt-3 mb-6 flex flex-wrap gap-x-1 border-b border-line">
      {shown.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? "page" : undefined}
          className={cx("-mb-px border-b-2 px-1.5 py-2 text-sm", t.href === current ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg")}
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
];
