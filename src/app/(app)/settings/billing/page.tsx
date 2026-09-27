import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { billingHistory, branchStandings } from "@/lib/services/saas";
import { fitronKeyId } from "@/lib/integrations/razorpay";
import { branchPrice, GRACE_DAYS, INCLUDED_BRANCHES, type Standing } from "@/lib/domain/saas";
import { Badge, Card, Empty, Notice, PageHeader } from "@/components/ui";
import { fmtDate, formatInr } from "@/lib/format";
import { PayButton } from "./pay-button";

export const metadata = { title: "Plan & billing · Fitron" };

function StandingBadge({ s }: { s: Standing }) {
  if (s.kind === "INCLUDED") return <Badge>Included</Badge>;
  if (s.kind === "PAID") return <Badge tone="ok">Paid till {fmtDate(s.until)}</Badge>;
  if (s.kind === "GRACE") return <Badge tone="accent">Grace till {fmtDate(s.readOnlyFrom)}</Badge>;
  return <Badge tone="alert">Read-only</Badge>;
}

export default async function BillingPage() {
  const u = await requirePermission("settings.manage");
  const [{ branches, freeSlots }, history] = await Promise.all([branchStandings(u.orgId), billingHistory(u)]);
  const demo = !fitronKeyId();
  const y = branchPrice("YEARLY");
  const m = branchPrice("MONTHLY");
  const extra = branches.filter((b) => b.standing.kind !== "INCLUDED").length;

  return (
    <>
      <PageHeader
        title="Plan & billing"
        subtitle={`Your Fitron plan includes ${INCLUDED_BRANCHES} branches. Each extra branch is ${formatInr(m.base)} a month or ${formatInr(y.base)} a year, plus 18% GST.`}
      />
      {demo && (
        <div className="mb-4">
          <Notice>Demo mode: Fitron&apos;s Razorpay keys aren&apos;t set on this server, so payments are simulated and no money is charged.</Notice>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card title={`Branches · ${branches.length - extra} of ${INCLUDED_BRANCHES} included${extra ? ` + ${extra} extra` : ""}`}>
            <ul className="divide-y divide-line text-sm">
              {branches.map((b) => (
                <li key={b.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{b.name}</span>
                    <StandingBadge s={b.standing} />
                  </div>
                  {b.standing.kind === "GRACE" && (
                    <p className="text-muted">
                      The paid period ended on {fmtDate(b.standing.until)}. Renew before {fmtDate(b.standing.readOnlyFrom)} to keep adding members and invoices.
                    </p>
                  )}
                  {b.standing.kind === "READ_ONLY" && <p className="text-muted">Records are kept and can be viewed, but no new members or invoices until it is renewed.</p>}
                  {b.standing.kind !== "INCLUDED" && <PayButton branchId={b.id} label="Renew" />}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Payments to Fitron">
            {history.length === 0 ? (
              <Empty>No payments yet.</Empty>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    <Link href={`/settings/billing/${h.id}`} className="flex flex-wrap justify-between gap-2 py-2 hover:text-accent">
                      <span>
                        {h.invoiceNo} · {h.cycle === "YEARLY" ? "Yearly" : "Monthly"} · {fmtDate(h.periodStart)} to {fmtDate(h.periodEnd)}
                        {h.branchId ? ` · ${branches.find((b) => b.id === h.branchId)?.name ?? ""}` : " · not used yet"}
                        {h.mode === "DEMO" ? " · demo" : ""}
                      </span>
                      <span className="tabular-nums">{formatInr(h.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card title="Add another branch">
            {freeSlots.length > 0 ? (
              <p className="text-sm">
                You have {freeSlots.length} paid branch slot
                {freeSlots.length === 1 ? "" : "s"} ready.{" "}
                <Link href="/settings" className="text-accent">
                  Add the branch in Settings
                </Link>
                .
              </p>
            ) : branches.length < INCLUDED_BRANCHES ? (
              <p className="text-sm">
                You can add {INCLUDED_BRANCHES - branches.length} more branch
                {INCLUDED_BRANCHES - branches.length === 1 ? "" : "es"} at no cost.{" "}
                <Link href="/settings" className="text-accent">
                  Add it in Settings
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  Pay for one extra branch, then add its details. Yearly is {formatInr(y.total)} with GST (saves {formatInr(m.total * 12 - y.total)} on monthly).
                </p>
                <PayButton branchId={null} label="Pay for a branch" />
              </div>
            )}
          </Card>
          <Card title="How renewals work">
            <p className="text-sm text-muted">
              You get a reminder 7, 3 and 1 days before an extra branch&apos;s period ends. After it ends there are {GRACE_DAYS} days&apos; grace, then the branch turns read-only. Nothing is ever
              deleted, and renewing switches it back on at once.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
