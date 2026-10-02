import Link from "next/link";
import { requireUser } from "@/lib/auth/current";
import { NAV } from "@/lib/nav";
import { NavLinks } from "@/components/nav-links";
import { MobileNav } from "@/components/mobile-nav";
import { BranchSwitcher } from "@/components/branch-switcher";
import { UserMenu } from "@/components/user-menu";
import { photoUrl } from "@/components/avatar";
import { Logo } from "@/components/logo";
import { unreadCount } from "@/lib/services/notifications";
import { gymPlan } from "@/lib/services/saas";
import { daysBetween } from "@/lib/domain/dates";
import { todayIso } from "@/lib/services/time";
import { fmtDate } from "@/lib/format";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const u = await requireUser();
  const unread = await unreadCount(u);
  const plan = await gymPlan(u.orgId);
  const s = plan.standing;
  const left = s.kind === "TRIAL" ? daysBetween(s.until, todayIso()) + 1 : 0;
  const banner =
    plan.checking && (s.kind === "TRIAL" || s.kind === "LAPSED")
      ? { alert: false, text: "Thanks for paying. We're checking your UPI payment and will confirm by email.", link: "" }
      : s.kind === "TRIAL"
        ? { alert: false, text: `Free trial of ${plan.name}: ${left} day${left === 1 ? "" : "s"} left. Everything stays as it is when you pay.`, link: "Choose a plan" }
        : s.kind === "GRACE"
          ? { alert: true, text: `Your ${plan.name} plan has ended. Renew before ${fmtDate(s.readOnlyFrom)} to keep adding members and invoices.`, link: "Renew" }
          : s.kind === "LAPSED"
            ? { alert: true, text: "Your FITRON plan has ended. Your data is safe; pay to keep adding members and invoices.", link: "Choose a plan" }
            : null;
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
            <Link href="/notifications" className="relative flex min-h-9 items-center rounded-md border border-line px-3 text-sm" aria-label={unread ? `${unread} unread alerts` : "Alerts"}>
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {unread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-alert px-1 text-center text-[11px] font-semibold leading-5 text-bg">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <UserMenu
              user={{
                name: u.name,
                email: u.email,
                role: u.role,
                branch: u.branch === "ALL" ? "All branches" : (u.branches.find((b) => b.id === u.branch)?.name ?? ""),
                photo: photoUrl(u.id, u.photoKey),
                canSettings: u.can("settings.manage"),
              }}
            />
          </div>
        </header>
        {banner && (
          <div className={`border-b border-line px-4 py-2 text-center text-sm sm:px-6 ${banner.alert ? "bg-alert-soft text-alert" : "bg-accent-soft"}`}>
            {banner.text}{" "}
            {banner.link && u.can("settings.manage") && (
              <Link href="/settings/billing" className="font-semibold underline">
                {banner.link}
              </Link>
            )}
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
