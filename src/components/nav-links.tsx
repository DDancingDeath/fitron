"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup } from "@/lib/nav";
import { cx } from "./ui";

export function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.group}>
          <p className="mb-1.5 px-3 text-xs font-semibold tracking-wider text-muted uppercase">{g.group}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const active = path === i.href || path.startsWith(i.href + "/");
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    className={cx(
                      "block rounded-md px-3 py-2 text-[15px]",
                      active ? "bg-accent-soft font-semibold text-accent" : "hover:bg-surface-2",
                    )}
                  >
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
