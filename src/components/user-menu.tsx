"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/login/actions";
import { Avatar } from "./avatar";

type MenuUser = { name: string; email: string; role: string; branch: string; photo: string | null; canSettings: boolean };

const item = "flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-accent-soft";

export function UserMenu({ user }: { user: MenuUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full" aria-haspopup="menu" aria-expanded={open} aria-label="Your account">
        <span className="hidden text-right text-sm leading-tight sm:block">
          <span className="block font-semibold">{user.name}</span>
          <span className="block text-muted">{user.role}</span>
        </span>
        <Avatar name={user.name} src={user.photo} className="size-9 text-sm" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-xl border border-line bg-surface p-2 shadow-lg">
          <div className="flex items-center gap-3 p-2.5">
            <Avatar name={user.name} src={user.photo} className="size-11" />
            <div className="min-w-0">
              <div className="truncate font-semibold">{user.name}</div>
              <div className="truncate text-xs text-muted">{user.email}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-accent/40 px-2 text-[11px] text-accent">{user.role}</span>
                <span className="text-[11px] text-muted">{user.branch}</span>
              </div>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          <Link role="menuitem" href="/profile" onClick={close} className={item}>
            My profile
          </Link>
          <Link role="menuitem" href="/profile?tab=password" onClick={close} className={item}>
            Change password
          </Link>
          <Link role="menuitem" href="/profile#activity" onClick={close} className={item}>
            My activity
          </Link>
          {user.canSettings && (
            <>
              <Link role="menuitem" href="/settings/billing" onClick={close} className={item}>
                Plan &amp; billing
              </Link>
              <Link role="menuitem" href="/settings" onClick={close} className={item}>
                Settings
              </Link>
            </>
          )}
          <div className="my-1 h-px bg-line" />
          <form action={logout}>
            <button role="menuitem" className={item}>
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
