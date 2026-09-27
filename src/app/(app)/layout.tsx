import Link from "next/link";
import { requireUser } from "@/lib/auth/current";
import { NAV } from "@/lib/nav";
import { NavLinks } from "@/components/nav-links";
import { MobileNav } from "@/components/mobile-nav";
import { BranchSwitcher } from "@/components/branch-switcher";
import { logout } from "@/app/login/actions";
import { Logo } from "@/components/logo";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const u = await requireUser();
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || u.can(i.perm)) })).filter((g) => g.items.length);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-surface p-4 lg:flex">
        <Link href="/dashboard" className="px-3 pt-2">
          <Logo />
        </Link>
        <NavLinks groups={groups} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <MobileNav groups={groups} />
            <span className="hidden font-semibold sm:inline">{u.orgName}</span>
            <BranchSwitcher branches={u.branches} value={u.branch} />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right text-sm leading-tight sm:block">
              <div className="font-semibold">{u.name}</div>
              <div className="text-muted">{u.role}</div>
            </div>
            <form action={logout}>
              <button className="min-h-9 rounded-md border border-line px-3 text-sm">Sign out</button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
