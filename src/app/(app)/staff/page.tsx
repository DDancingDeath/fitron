import Link from "next/link";
import { CheckIcon, MinusIcon, PencilSimpleIcon, UserMinusIcon, UserPlusIcon } from "@phosphor-icons/react/dist/ssr";
import { requirePermission } from "@/lib/auth/current";
import { listRoles, listStaff } from "@/lib/services/staff";
import { Button, LinkButton, Notice, TABLE, TD, TH, TR, cx } from "@/components/ui";
import { Tag } from "@/components/tag";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { fmtStamp, initials } from "@/lib/format";
import { toggleStaff } from "./actions";

export const metadata = { title: "Staff & roles · Fitron" };

export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  const u = await requirePermission("staff.manage");
  const { error, tab: t } = await searchParams;
  const tab = t === "perm" ? "perm" : "team";
  const [staff, roles] = await Promise.all([listStaff(u), listRoles()]);
  const active = staff.filter((s) => s.active);
  const tabs = [
    ["team", `Team (${active.length})`],
    ["perm", "Permissions"],
  ];
  return (
    <div className="flex flex-col gap-6 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] tracking-[0.12em] text-accent uppercase">Team</div>
          <h1 className="mt-1 text-[28px] lg:text-[40px]">Staff &amp; roles</h1>
          <div className="mt-1 text-sm text-muted">
            {active.length} people · {new Set(active.map((s) => s.role.name)).size} roles
          </div>
        </div>
        <LinkButton href="/staff/new" variant="primary">
          <UserPlusIcon size={17} weight="duotone" />
          Add staff
        </LinkButton>
      </div>
      {typeof error === "string" && <Notice tone="alert">{error}</Notice>}
      <nav className="flex gap-0.5 overflow-x-auto border-b border-line">
        {tabs.map(([k, label]) => (
          <Link key={k} href={k === "team" ? "/staff" : "/staff?tab=perm"} className={cx("-mb-px flex-none border-b-2 px-3.5 py-2.5 text-[15px] whitespace-nowrap", k === tab ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "team" && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3.5">
          {staff.map((s) => (
            <div key={s.id} className={cx("flex flex-col gap-3.5 rounded-lg bg-surface p-[18px]", !s.active && "opacity-60")}>
              <div className="flex items-center gap-3">
                <span className="grid size-11 flex-none place-items-center rounded-full bg-accent-soft font-semibold text-accent">{initials(s.name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold">{s.name}</div>
                  <div className="text-xs text-muted">{s.lastLoginAt ? `Last sign-in ${fmtStamp(s.lastLoginAt)}` : "Never signed in"}</div>
                </div>
                {s.active ? <span className="rounded-sm border border-accent-500 bg-accent-soft px-2.5 py-[3px] text-[11px] whitespace-nowrap text-accent-strong">{s.role.name}</span> : <Tag label="Deactivated" />}
              </div>
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                <span className="text-muted">Branch</span>
                <span>{s.branches.map((b) => b.branch.name).join(", ") || "—"}</span>
                <span className="text-muted">Shift</span>
                <span>{s.shift || "—"}</span>
                <span className="text-muted">Phone</span>
                <span>{s.phone}</span>
                <span className="text-muted">Email</span>
                <span className="truncate">{s.email}</span>
              </div>
              <div className="flex gap-1.5 border-t border-line pt-3">
                <LinkButton href={`/staff/${s.id}/edit`} className="flex-1">
                  <PencilSimpleIcon size={16} weight="duotone" />
                  Edit &amp; role
                </LinkButton>
                {s.id !== u.id && (
                  <form action={toggleStaff.bind(null, s.id, !s.active)}>
                    <Button variant="ghost" className={s.active ? "text-alert-700" : undefined} title={s.active ? "Deactivate" : "Reactivate"} aria-label={s.active ? `Deactivate ${s.name}` : `Reactivate ${s.name}`}>
                      {s.active ? <UserMinusIcon size={18} weight="duotone" /> : "Reactivate"}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "perm" && !u.has("roles") && (
        <Notice tone="accent">
          Changing what each role can do is on the Enterprise plan. Your roles keep their standard permissions.{" "}
          <Link href="/settings/billing?upgrade=roles" className="font-semibold underline">
            See plans
          </Link>
        </Notice>
      )}
      {tab === "perm" && u.has("roles") && (
        <section>
          <h3 className="mb-1.5 text-[22px]">Permissions</h3>
          <p className="mb-3.5 text-[13px] text-muted">What each role can do. Change a person&apos;s role from Edit &amp; role.</p>
          <div className="overflow-x-auto">
            <table className={cx(TABLE, "min-w-[720px]")}>
              <thead>
                <tr>
                  <th className={TH}>Module / action</th>
                  {roles.map((r) => (
                    <th key={r.id} className={cx(TH, "text-center")}>
                      {r.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).map((k) => (
                  <tr key={k} className={TR}>
                    <td className={TD}>{PERMISSIONS[k]}</td>
                    {roles.map((r) => {
                      const has = r.permissions.some((p) => p.permission.key === k);
                      return (
                        <td key={r.id} className={cx(TD, "text-center", has ? "text-accent" : "text-fg/30")}>
                          {has ? <CheckIcon size={17} weight="bold" className="inline" aria-label="Yes" /> : <MinusIcon size={17} className="inline" aria-label="No" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
