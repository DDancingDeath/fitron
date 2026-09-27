import Link from "next/link";
import { requireUser } from "@/lib/auth/current";
import { listMembers } from "@/lib/services/members";
import { Card, Notice, PageHeader } from "@/components/ui";
import { MemberStatus, STATUS_LABEL } from "@/components/status";
import { fmtDate, formatInr } from "@/lib/format";
import type { MembershipStatus } from "@/lib/domain/membership";

export const metadata = { title: "Dashboard · Fitron" };

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const u = await requireUser();
  const sp = await searchParams;
  const data = u.can("members.view") ? await listMembers(u, { all: true }) : null;
  const all = data?.rows ?? [];
  const expiring = all.filter((r) => r.status === "EXPIRING_SOON").sort((a, b) => (a.latestEnd ?? "").localeCompare(b.latestEnd ?? ""));
  const outstanding = all.reduce((s, r) => s + r.outstanding, 0);

  return (
    <>
      <PageHeader title={`Hello, ${u.name.split(" ")[0]}`} subtitle={`${u.orgName} · ${u.role}`} />
      {sp.denied && <Notice tone="alert">Your role doesn&apos;t have access to that page.</Notice>}
      {data && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {(["ACTIVE", "EXPIRING_SOON", "PAYMENT_PENDING", "EXPIRED"] as MembershipStatus[]).map((s) => (
            <Link key={s} href={`/members?status=${s}`} className="rounded-xl border border-line bg-surface p-4 hover:border-accent">
              <div className="text-sm text-muted">{STATUS_LABEL[s]}</div>
              <div className="mt-1 text-3xl font-semibold">{data.counts[s] ?? 0}</div>
            </Link>
          ))}
        </div>
      )}
      {data && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card title="Expiring in the next 7 days">
            {expiring.length === 0 ? (
              <p className="text-muted">No memberships expiring this week.</p>
            ) : (
              <ul className="divide-y divide-line">
                {expiring.slice(0, 8).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/members/${m.id}`} className="font-semibold hover:text-accent">
                      {m.name}
                    </Link>
                    <span className="text-sm text-muted">{fmtDate(m.latestEnd)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Dues">
            <div className="text-3xl font-semibold">{formatInr(outstanding)}</div>
            <p className="mt-1 text-muted">outstanding across {all.filter((r) => r.outstanding > 0).length} members</p>
            <ul className="mt-3 divide-y divide-line">
              {all
                .filter((r) => r.outstanding > 0)
                .sort((a, b) => b.outstanding - a.outstanding)
                .slice(0, 5)
                .map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/members/${m.id}`} className="hover:text-accent">
                      {m.name}
                    </Link>
                    <span className="flex items-center gap-2">
                      <MemberStatus status={m.status} />
                      <span className="font-semibold">{formatInr(m.outstanding)}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
