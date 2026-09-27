import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { listRoles, listStaff } from "@/lib/services/staff";
import { Badge, Button, Card, LinkButton, Notice, PageHeader } from "@/components/ui";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { fmtDate } from "@/lib/format";
import { toggleStaff } from "./actions";

export const metadata = { title: "Staff · Fitron" };

export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  const u = await requirePermission("staff.manage");
  const { error } = await searchParams;
  const [staff, roles] = await Promise.all([listStaff(u), listRoles()]);
  return (
    <>
      <PageHeader title="Staff & roles" actions={<LinkButton href="/staff/new" variant="primary">Add staff</LinkButton>} />
      {typeof error === "string" && <div className="mb-4"><Notice tone="alert">{error}</Notice></div>}
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/staff/${s.id}/edit`} className="font-semibold hover:text-accent">
                  {s.name}
                </Link>
                <div className="truncate text-sm text-muted">
                  {s.email} · {s.phone} · {s.branches.map((b) => b.branch.name).join(", ")}
                </div>
              </div>
              <Badge tone="accent">{s.role.name}</Badge>
              {!s.active && <Badge tone="alert">Deactivated</Badge>}
              <span className="text-sm text-muted">Last sign-in {s.lastLoginAt ? fmtDate(s.lastLoginAt) : "never"}</span>
              {s.id !== u.id && (
                <form action={toggleStaff.bind(null, s.id, !s.active)}>
                  <Button>{s.active ? "Deactivate" : "Reactivate"}</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
      <h2 className="mt-10 mb-3 text-2xl font-semibold">What each role can do</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {roles.map((r) => (
          <Card key={r.id} title={r.name}>
            <ul className="flex flex-wrap gap-1.5">
              {r.permissions.map((p) => (
                <li key={p.permissionId}>
                  <Badge>{PERMISSIONS[p.permission.key as keyof typeof PERMISSIONS] ?? p.permission.key}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
