import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { activeMemberCount, billingHistory, branchStandings, gymPlan, paymentRef } from "@/lib/services/saas";
import { fitronKeyId } from "@/lib/integrations/razorpay";
import { fitronUpi, isFitronAdmin } from "@/lib/integrations/upi";
import { PLANS } from "@/lib/domain/pricing";
import { branchPrice, GRACE_DAYS, gymPlanCards, type PlanStanding, type Standing } from "@/lib/domain/saas";
import { PlanCards } from "@/components/plan-cards";
import { FEATURES, planFor, type Feature } from "@/lib/domain/features";
import { Badge, Card, Empty, Notice, PageHeader } from "@/components/ui";
import { SETTINGS_TABS, SectionTabs } from "@/components/section-tabs";
import { fmtDate, formatInr } from "@/lib/format";
import { PayButton } from "./pay-button";

export const metadata = { title: "Plan & billing · Fitron" };

function StandingBadge({ s }: { s: Standing }) {
  if (s.kind === "INCLUDED") return <Badge>Included</Badge>;
  if (s.kind === "PAID") return <Badge tone="ok">Paid till {fmtDate(s.until)}</Badge>;
  if (s.kind === "GRACE") return <Badge tone="accent">Grace till {fmtDate(s.readOnlyFrom)}</Badge>;
  return <Badge tone="alert">Read-only</Badge>;
}

function PlanBadge({ s, checking }: { s: PlanStanding; checking: boolean }) {
  if (checking && (s.kind === "TRIAL" || s.kind === "LAPSED")) return <Badge tone="accent">Payment being checked</Badge>;
  if (s.kind === "CUSTOM") return <Badge tone="ok">Set up by FITRON</Badge>;
  if (s.kind === "TRIAL") return <Badge tone="accent">Free trial till {fmtDate(s.until)}</Badge>;
  if (s.kind === "PAID") return <Badge tone="ok">Paid till {fmtDate(s.until)}</Badge>;
  if (s.kind === "GRACE") return <Badge tone="accent">Grace till {fmtDate(s.readOnlyFrom)}</Badge>;
  return <Badge tone="alert">Ended · read-only</Badge>;
}

const STATUS: Record<string, string> = { PAID: "", SUBMITTED: " · being checked", REJECTED: " · not matched" };
const prices = (f: (c: "MONTHLY" | "YEARLY") => { total: number }) => ({ MONTHLY: f("MONTHLY").total, YEARLY: f("YEARLY").total });

export default async function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  const u = await requirePermission("settings.manage");
  const sp = await searchParams;
  const upgrade = typeof sp.upgrade === "string" && sp.upgrade in FEATURES ? (sp.upgrade as Feature) : null;
  const [{ branches, freeSlots, terms }, history, plan, members] = await Promise.all([branchStandings(u.orgId), billingHistory(u), gymPlan(u.orgId), activeMemberCount(db, u.orgId)]);
  const upi = fitronUpi();
  const demo = !upi && !fitronKeyId();
  const admin = isFitronAdmin(u.email);
  const toCheck = admin ? await db.branchSubscription.count({ where: { mode: "UPI", status: "SUBMITTED" } }) : 0;
  const y = branchPrice("YEARLY");
  const m = branchPrice("MONTHLY");
  const extra = branches.filter((b) => b.standing.kind !== "INCLUDED").length;
  const s = plan.standing;
  const renewing = s.kind === "PAID" || s.kind === "GRACE";

  return (
    <>
      <PageHeader title="Plan & billing" subtitle="Your FITRON Gym Accounting plan, extra branches and payments to FITRON. Prices are plus 18% GST." />
      <SectionTabs u={u} tabs={SETTINGS_TABS} current="/settings/billing" />
      <div className="mb-4 flex flex-col gap-2">
        {upgrade && (
          <Notice tone="accent">
            <strong>{FEATURES[upgrade].label}</strong> is on the <strong>{planFor(upgrade).name}</strong> plan ({FEATURES[upgrade].card}). Your gym is on {plan.name}. Pick {planFor(upgrade).name} below; it opens as soon as the payment is confirmed.
          </Notice>
        )}
        {demo && <Notice>Demo mode: FITRON&apos;s UPI ID isn&apos;t set on this server, so payments are simulated and no money is charged.</Notice>}
        {upi && <Notice tone="neutral">You pay by UPI to {upi.name} ({upi.id}) and enter the UTR. We check it and email you, usually within a working day; your gym keeps working meanwhile.</Notice>}
        {admin && (
          <Notice tone="ok">
            FITRON team: {toCheck} UPI payment{toCheck === 1 ? "" : "s"} to check.{" "}
            <Link href="/fitron-admin" className="font-semibold underline">
              Open payment checks
            </Link>
          </Notice>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card title="Your plan" action={<PlanBadge s={s} checking={plan.checking} />}>
            {terms.custom ? (
              <p className="text-sm">
                FITRON set up your gym by hand, so it has no member limit and {terms.includedBranches} branches are included. Extra branches are paid below. Write to hello@fitron.in to move to a
                listed plan.
              </p>
            ) : (
              <div className="flex flex-col gap-4 text-sm">
                <p>
                  <strong>{plan.name}</strong> · {plan.cycle === "YEARLY" ? "yearly" : "monthly"} · {members} active member{members === 1 ? "" : "s"}
                  {terms.memberLimit !== null ? ` of ${terms.memberLimit}` : ", no limit"} · {branches.length} branch{branches.length === 1 ? "" : "es"}
                </p>
                {s.kind === "LAPSED" && !plan.checking && <p className="text-alert">Your plan has ended, so no new members or invoices can be added. Nothing is deleted; paying switches it back on at once.</p>}
                {s.kind === "GRACE" && <p className="text-muted">Your paid period ended on {fmtDate(s.until)}. Renew before {fmtDate(s.readOnlyFrom)} to keep adding members and invoices.</p>}
                <PlanCards plans={gymPlanCards()} current={plan.key} labels={{ current: renewing ? "Renew" : "Pay", other: "Switch" }} />
                <p className="text-muted">
                  A new plan applies as soon as it&apos;s paid. The paid period starts after your current one (or after the free trial), so you never lose days.
                </p>
              </div>
            )}
          </Card>
          <Card title={`Branches · ${branches.length - extra} included${extra ? ` + ${extra} extra` : ""}`}>
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
                  {b.standing.kind !== "INCLUDED" && terms.extraBranches && (
                    <PayButton what={{ kind: "BRANCH", branchId: b.id }} label="Renew" prices={prices(branchPrice)} success="Paid. The branch is renewed." />
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Payments to FITRON">
            {history.length === 0 ? (
              <Empty>No payments yet.</Empty>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {history.map((h) => {
                  const what = h.kind === "PLAN" ? `${PLANS.find((p) => p.key === h.plan)?.name ?? h.plan} plan` : `Extra branch${h.branchId ? ` · ${branches.find((b) => b.id === h.branchId)?.name ?? ""}` : " · not used yet"}`;
                  const line = (
                    <>
                      <span>
                        {h.invoiceNo ?? paymentRef(h.id)} · {what} · {h.cycle === "YEARLY" ? "Yearly" : "Monthly"}
                        {h.periodStart ? ` · ${fmtDate(h.periodStart)} to ${fmtDate(h.periodEnd)}` : ""}
                        {h.utr ? ` · UTR ${h.utr}` : ""}
                        {h.mode === "DEMO" ? " · demo" : ""}
                        <span className={h.status === "REJECTED" ? "text-alert" : "text-muted"}>{STATUS[h.status]}</span>
                        {h.rejectReason && <span className="block text-alert">{h.rejectReason}</span>}
                      </span>
                      <span className="tabular-nums">{formatInr(h.total)}</span>
                    </>
                  );
                  return (
                    <li key={h.id}>
                      {h.status === "PAID" ? (
                        <Link href={`/settings/billing/${h.id}`} className="flex flex-wrap justify-between gap-2 py-2 hover:text-accent">
                          {line}
                        </Link>
                      ) : (
                        <div className="flex flex-wrap justify-between gap-2 py-2">{line}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card title="Add another branch">
            {!terms.extraBranches ? (
              <p className="text-sm">{plan.name} is for one branch. Enterprise includes 3 branches, and more cost {formatInr(m.base)} a month each.</p>
            ) : freeSlots.length > 0 ? (
              <p className="text-sm">
                You have {freeSlots.length} paid branch slot
                {freeSlots.length === 1 ? "" : "s"} ready.{" "}
                <Link href="/settings" className="text-accent">
                  Add the branch in Settings
                </Link>
                .
              </p>
            ) : branches.length < terms.includedBranches ? (
              <p className="text-sm">
                You can add {terms.includedBranches - branches.length} more branch
                {terms.includedBranches - branches.length === 1 ? "" : "es"} at no cost.{" "}
                <Link href="/settings" className="text-accent">
                  Add it in Settings
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  Each extra branch is {formatInr(m.base)} a month or {formatInr(y.base)} a year, plus GST. Yearly is {formatInr(y.total)} with GST (saves {formatInr(m.total * 12 - y.total)} on
                  monthly).
                </p>
                <PayButton what={{ kind: "BRANCH", branchId: null }} label="Pay for a branch" prices={prices(branchPrice)} success="Paid. Now add the new branch in Settings › Branches." />
              </div>
            )}
          </Card>
          <Card title="How renewals work">
            <p className="text-sm text-muted">
              You get a reminder before your trial or a paid period ends. After a paid period there are {GRACE_DAYS} days&apos; grace, then the gym (or that extra branch) turns read-only. Nothing is
              ever deleted, and paying switches it back on at once.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
