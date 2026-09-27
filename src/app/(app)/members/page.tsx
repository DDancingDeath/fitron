import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { listMembers } from "@/lib/services/members";
import { listPlans } from "@/lib/services/plans";
import { Empty, Input, LinkButton, PageHeader, Select, Button } from "@/components/ui";
import { MemberStatus, STATUS_LABEL } from "@/components/status";
import { fmtDate, formatInr, initials } from "@/lib/format";
import { GENDERS } from "@/lib/validation/member";

export const metadata = { title: "Members · Fitron" };

export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const u = await requirePermission("members.view");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const f = { q: str("q"), status: str("status"), gender: str("gender"), plan: str("plan"), page: Number(str("page") ?? 1) || 1 };
  const [{ rows, total, page, pageSize }, plans] = await Promise.all([listMembers(u, f), listPlans(u)]);
  const pages = Math.ceil(total / pageSize);
  const qs = (p: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page: String(p) } as Record<string, string>).toString();

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={`${total} ${total === 1 ? "member" : "members"}`}
        actions={u.can("members.create") && <LinkButton href="/members/new" variant="primary">Add member</LinkButton>}
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <Input name="q" defaultValue={f.q} placeholder="Search name, phone, ID or email" aria-label="Search" />
        <Select name="status" defaultValue={f.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select name="plan" defaultValue={f.plan ?? ""} aria-label="Plan">
          <option value="">Any plan</option>
          {plans.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="gender" defaultValue={f.gender ?? ""} aria-label="Gender">
          <option value="">Any gender</option>
          {GENDERS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </Select>
        <Button>Filter</Button>
      </form>

      {rows.length === 0 ? (
        <Empty>{f.q || f.status || f.plan || f.gender ? "No members match these filters." : "No members yet. Add your first member."}</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {rows.map((m) => (
              <li key={m.id}>
                <Link href={`/members/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                    {initials(m.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {m.code} · {m.phone}
                      {m.planName ? ` · ${m.planName}` : ""}
                    </span>
                  </span>
                  <span className="hidden text-right text-sm sm:block">
                    <span className="block text-muted">Ends</span>
                    <span>{fmtDate(m.latestEnd)}</span>
                  </span>
                  {m.outstanding > 0 && <span className="hidden text-sm font-semibold text-alert md:block">{formatInr(m.outstanding)}</span>}
                  <MemberStatus status={m.status} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={`/members?${qs(page - 1)}`}>← Previous</Link> : <span />}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={`/members?${qs(page + 1)}`}>Next →</Link> : <span />}
        </div>
      )}
    </>
  );
}
