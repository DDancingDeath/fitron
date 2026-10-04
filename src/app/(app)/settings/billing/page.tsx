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
import { Badge, Button, Card, cx, Empty, Field, Input, LinkButton, Notice, PageHeader, Select, TABLE, TD, TH, TR } from "@/components/ui";
import { SETTINGS_TABS, SectionTabs } from "@/components/section-tabs";
import { fmtDate, formatInr } from "@/lib/format";
import { getSubscriptionSettings, gymWhatsAppNumber } from "@/lib/services/subscription";
import { REMIND_DAYS } from "@/lib/domain/saas";
import { PayButton } from "./pay-button";
import { saveBillingDetails, saveRenewalReminders } from "./actions";

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

const STATUS: Record<string, string> = { PAID: "", SUBMITTED: "Being checked", REJECTED: "Not matched" };
const REMIND_LABEL: Record<number, string> = { 14: "14 days before", 7: "7 days before", 3: "3 days before", 1: "1 day before" };
/** "919000000001" → "+91 9000000001" */
const showNumber = (n: string) => `+${n.slice(0, 2)} ${n.slice(2)}`;
const prices = (f: (c: "MONTHLY" | "YEARLY") => { total: number }) => ({ MONTHLY: f("MONTHLY").total, YEARLY: f("YEARLY").total });

export default async function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  const u = await requirePermission("settings.manage");
  const sp = await searchParams;
  const upgrade = typeof sp.upgrade === "string" && sp.upgrade in FEATURES ? (sp.upgrade as Feature) : null;
  const [{ branches, freeSlots, terms }, history, plan, members, sub, gymNumber] = await Promise.all([
    branchStandings(u.orgId),
    billingHistory(u),
    gymPlan(u.orgId),
    activeMemberCount(db, u.orgId),
    getSubscriptionSettings(u.orgId),
    gymWhatsAppNumber(u.orgId),
  ]);
  const paidTotal = history.filter((h) => h.status === "PAID").reduce((a, h) => a + h.total, 0);
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
        {typeof sp.saved === "string" && <Notice tone="ok">Saved. Changes are recorded in the audit log.</Notice>}
        {typeof sp.error === "string" && <Notice tone="alert">{sp.error}</Notice>}
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
                <p className="text-muted">Total paid to FITRON: {formatInr(paidTotal)}</p>
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
          <Card title="Renewal reminders">
            <p className="mb-4 text-sm text-muted">FITRON reminds you before your plan or trial ends so the account never locks by surprise.</p>
            <form action={saveRenewalReminders} className="flex flex-col gap-4">
              <Field label="Remind me" className="max-w-[260px]">
                <Select name="remindDays" defaultValue={String(sub.remindDays)}>
                  {REMIND_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {REMIND_LABEL[d]}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex flex-wrap items-center gap-2.5 text-sm">
                <input type="checkbox" name="whatsapp" defaultChecked={sub.whatsapp} className="size-[18px] accent-accent" />
                WhatsApp reminder to the gym number
                <span className="text-muted">{gymNumber ? `· to ${showNumber(gymNumber)}` : "· add a phone in Gym profile first"}</span>
              </label>
              <label className="flex flex-wrap items-center gap-2.5 text-sm">
                <input type="checkbox" name="email" defaultChecked={sub.email} className="size-[18px] accent-accent" />
                Email reminder to the billing email
                <span className="text-muted">{sub.billingEmail ? `· to ${sub.billingEmail}` : "· to every Super Admin's sign-in email until a billing email is set"}</span>
              </label>
              <div>
                <Button variant="primary">Save</Button>
              </div>
            </form>
            <p className="mt-4 text-xs text-muted">
              Reminders are also shown in the bell and on this page. Sent by the daily job &quot;Plan and branch renewal reminders&quot; (
              <Link href="/settings/jobs" className="underline">
                Settings › Daily jobs
              </Link>
              ).
            </p>
          </Card>
          <Card title="Billing details">
            <p className="mb-4 text-sm text-muted">Printed on your FITRON receipts. Add your GSTIN to claim input tax credit.</p>
            <form action={saveBillingDetails} className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Legal / business name">
                  <Input name="legalName" defaultValue={sub.legalName} placeholder="Power Haus Gym" maxLength={120} />
                </Field>
                <Field label="GSTIN (optional)">
                  <Input name="gstin" defaultValue={sub.gstin} placeholder="20ABCDE1234F1Z5" maxLength={15} className="uppercase" />
                </Field>
                <Field label="Billing email">
                  <Input name="billingEmail" type="email" defaultValue={sub.billingEmail} placeholder="accounts@yourgym.in" maxLength={120} />
                </Field>
                <Field label="Billing address">
                  <Input name="address" defaultValue={sub.address} placeholder="C-7, Sector 4, City Centre, Bokaro" maxLength={300} />
                </Field>
              </div>
              <div>
                <Button variant="primary">Save</Button>
              </div>
            </form>
            <p className="mt-3 text-xs text-muted">Leave the name blank to use your gym name; leave the GSTIN blank to use the GSTIN of your first branch.</p>
          </Card>
          <Card title="Payment history">
            {history.length === 0 ? (
              <Empty>No payments yet. Your receipts will appear here.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className={TABLE}>
                  <thead>
                    <tr>
                      <th className={TH}>Receipt</th>
                      <th className={TH}>Date</th>
                      <th className={TH}>Plan</th>
                      <th className={TH}>UTR</th>
                      <th className={TH}>Valid till</th>
                      <th className={cx(TH, "text-right")}>Amount</th>
                      <th className={TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => {
                      const what =
                        h.kind === "PLAN"
                          ? `${PLANS.find((p) => p.key === h.plan)?.name ?? h.plan} plan · ${h.cycle === "YEARLY" ? "Yearly" : "Monthly"}`
                          : `Extra branch · ${h.branchId ? (branches.find((b) => b.id === h.branchId)?.name ?? "") : "not used yet"}`;
                      return (
                        <tr key={h.id} className={TR}>
                          <td className={cx(TD, "whitespace-nowrap")}>{h.invoiceNo ?? paymentRef(h.id)}</td>
                          <td className={cx(TD, "whitespace-nowrap")}>{fmtDate(h.paidAt ?? h.submittedAt ?? h.createdAt)}</td>
                          <td className={TD}>
                            {what}
                            {h.mode === "DEMO" ? " · demo" : ""}
                            {STATUS[h.status] && <div className={h.status === "REJECTED" ? "text-alert" : "text-muted"}>{STATUS[h.status]}</div>}
                            {h.rejectReason && <div className="text-alert">{h.rejectReason}</div>}
                          </td>
                          <td className={cx(TD, "tabular-nums")}>{h.utr ?? (h.mode === "LIVE" && h.razorpayPaymentId ? `Razorpay ${h.razorpayPaymentId}` : "—")}</td>
                          <td className={cx(TD, "whitespace-nowrap")}>{h.status === "PAID" ? fmtDate(h.periodEnd) : "—"}</td>
                          <td className={cx(TD, "text-right font-semibold tabular-nums")}>{formatInr(h.total)}</td>
                          <td className={cx(TD, "text-right")}>
                            {h.status === "PAID" && (
                              <LinkButton href={`/settings/billing/${h.id}`} variant="ghost">
                                Receipt
                              </LinkButton>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
