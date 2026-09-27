import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { listAudit } from "@/lib/services/accounting";
import { Button, Empty, Input, PageHeader, Select } from "@/components/ui";

export const metadata = { title: "Audit log · Fitron" };

const ENTITIES = ["Member", "Membership", "Invoice", "Payment", "Expense", "MembershipPlan", "User", "Setting", "Branch", "MonthLock"];

const when = (d: Date) =>
  d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function changes(before: unknown, after: unknown): string[] {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [];
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  return Object.keys(a)
    .filter((k) => !["updatedAt", "createdAt"].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => `${k}: ${JSON.stringify(b[k]) ?? "—"} → ${JSON.stringify(a[k])}`);
}

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const u = await requirePermission("audit.view");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const f = { q: s("q"), userId: s("user"), entity: s("entity"), page: Number(s("page") ?? 1) || 1 };
  const { rows, total, page, pageSize, users } = await listAudit(u, f);
  const pages = Math.ceil(total / pageSize);
  const qs = (p: number) => new URLSearchParams({ ...(f.q ? { q: f.q } : {}), ...(f.userId ? { user: f.userId } : {}), ...(f.entity ? { entity: f.entity } : {}), page: String(p) }).toString();

  return (
    <>
      <PageHeader title="Audit log" subtitle={`${total} entries. Every change to members, money, plans, staff and settings is recorded here and can't be edited.`} />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <Input name="q" defaultValue={f.q} placeholder="Action (e.g. payment.reverse) or record id" aria-label="Search" />
        <Select name="user" defaultValue={f.userId ?? ""} aria-label="Staff">
          <option value="">Anyone</option>
          {users.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
        <Select name="entity" defaultValue={f.entity ?? ""} aria-label="Record type">
          <option value="">Any record</option>
          {ENTITIES.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </Select>
        <Button>Filter</Button>
      </form>
      {rows.length === 0 ? (
        <Empty>No entries.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line text-sm">
            {rows.map((r) => {
              const diff = changes(r.before, r.after);
              return (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-semibold">{r.action}</span> <span className="text-muted">on {r.entity}</span>
                    </span>
                    <span className="text-muted">
                      {r.userName} · {when(r.createdAt)}
                      {r.ip ? ` · ${r.ip}` : ""}
                    </span>
                  </div>
                  {diff.length > 0 && (
                    <ul className="mt-1 text-xs break-all text-muted">
                      {diff.slice(0, 8).map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`/audit?${qs(page - 1)}`}>← Newer</Link> : <span />}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={`/audit?${qs(page + 1)}`}>Older →</Link> : <span />}
        </div>
      )}
    </>
  );
}
