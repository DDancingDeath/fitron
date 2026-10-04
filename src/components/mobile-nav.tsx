"use client";

import { useState } from "react";
import { ListIcon, XIcon } from "@phosphor-icons/react";
import type { NavGroup } from "@/lib/nav";
import { NavLinks } from "./nav-links";
import { SideLogo } from "./side-logo";

export function MobileNav({ groups, orgName, branchName, logo }: { groups: NavGroup[]; orgName: string; branchName: string; logo?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
      <button type="button" onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-md" aria-label="Menu" aria-expanded={open}>
        <ListIcon size={22} weight="duotone" />
      </button>
      <div className="min-w-0 flex-1 truncate text-[17px] font-semibold">
        {orgName} <span className="text-[13px] font-normal text-muted">{branchName}</span>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex h-full w-72 flex-col gap-5 overflow-y-auto border-r border-line-soft bg-surface px-3.5 pb-6">
            <div className="mt-3 flex items-start justify-between">
              <span className="block w-[180px]">
                <SideLogo src={logo} name={orgName} />
              </span>
              <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center" aria-label="Close menu">
                <XIcon size={20} />
              </button>
            </div>
            <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
          </div>
          <button type="button" aria-label="Close menu" className="flex-1 bg-black/60" onClick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
