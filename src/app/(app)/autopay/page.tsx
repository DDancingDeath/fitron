import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { getAutopayMode, listMandates } from "@/lib/services/autopay";
import { memberOptions } from "@/lib/services/members";
import { getTax } from "@/lib/services/tax";
import { razorpayReady } from "@/lib/integrations/razorpay";
import { invoiceTotals } from "@/lib/domain/billing";
import { Badge, Card, Empty, Notice, PageHeader } from "@/components/ui";
import { fmtDate, formatInr } from "@/lib/format";
import { MandateForm } from "./autopay-forms";
import { MANDATE_TONE } from "./tone";

export const metadata = { title: "UPI Autopay · Fitron" };


export default async function AutopayPage() {
  const u = await requirePermission("autopay.manage");
  const [mode, mandates, members, plans, tax] = await Promise.all([
    getAutopayMode(u.orgId),
    listMandates(u),
    memberOptions(u),
    db.membershipPlan.findMany({ where: { orgId: u.orgId, status: "ACTIVE" }, orderBy: { price: "asc" } }),
    getTax(u.orgId),
  ]);
  const active = mandates.filter((m) => m.status === "Active");
  const monthly = active.reduce((a, m) => a + m.amount / m.months, 0);
  const missing = mode === "live" ? razorpayReady() : null;
  return (
    <>
      <PageHeader title="UPI Autopay" subtitle={`${active.length} active · about ${formatInr(Math.round(monthly))} a month on autopay`} />
      <div className="mb-4">
        {mode === "demo" ? (
          <Notice>Demo mode: approval and debits are simulated so you can try the flow. Switch to live in Settings once Razorpay is set up.</Notice>
        ) : missing ? (
          <Notice tone="alert">Live mode, but {missing}</Notice>
        ) : (
          <Notice tone="ok">Live: members approve in their UPI app, and Razorpay debits on each renewal date.</Notice>
        )}
      </div>
      <Card title="Set up autopay for a member" className="mb-6">
        <MandateForm
          members={members}
          plans={plans.map((p) => ({ id: p.id, label: `${p.name} · ${formatInr(invoiceTotals([{ qty: 1, rate: p.price, discount: p.discount, taxRate: tax.enabled && p.gstApplicable ? tax.rate : 0 }]).total)} every ${p.months} month${p.months > 1 ? "s" : ""}` }))}
        />
      </Card>
      {mandates.length === 0 ? (
        <Empty>No autopay mandates yet.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {mandates.map((m) => (
              <li key={m.id}>
                <Link href={`/autopay/${m.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.member.name}</span>
                    <span className="text-sm text-muted">
                      {m.code} · {m.planName} · {formatInr(m.amount)}
                      {m.lastResult ? ` · ${m.lastResult}` : ""}
                    </span>
                  </span>
                  <span className="text-sm text-muted">{m.nextDebitOn && ["Active", "Pending"].includes(m.status) ? `Next ${fmtDate(m.nextDebitOn)}` : ""}</span>
                  {m.mode === "demo" && <Badge>Demo</Badge>}
                  <Badge tone={MANDATE_TONE[m.status as keyof typeof MANDATE_TONE] ?? "neutral"}>{m.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
