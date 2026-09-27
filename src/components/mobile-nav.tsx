"use client";

import { useState } from "react";
import type { NavGroup } from "@/lib/nav";
import { NavLinks } from "./nav-links";

export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-10 rounded-md border border-line px-3 text-sm font-semibold"
        aria-expanded={open}
      >
        Menu
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button type="button" aria-label="Close menu" className="flex-1 bg-black/60" onClick={() => setOpen(false)} />
          <div className="order-first h-full w-72 overflow-y-auto border-r border-line bg-surface p-4">
            <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
