import Link from "next/link";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { getAutopayMode, listMandates } from "@/lib/services/autopay";
import { memberOptions } from "@/lib/services/members";
import { getTax } from "@/lib/services/tax";
import { fromIso, todayIso } from "@/lib/services/time";
import { razorpayReady } from "@/lib/integrations/razorpay";
import { invoiceTotals } from "@/lib/domain/billing";
import { addDays } from "@/lib/domain/dates";
import { LinkButton, Notice, Segmented, TABLE, TD, TH, TR, cx } from "@/components/ui";
import { Tag } from "@/components/tag";
import { fmtDate, formatInr, formatRupees, initials } from "@/lib/format";
import { MandateButton, MandateForm } from "./autopay-forms";

export const metadata = { title: "UPI Autopay · Fitron" };

const BAD = ["Failed", "Halted"];
const FILTERS = [
  ["all", "All"],
  ["Active", "Active"],
  ["attention", "Needs attention"],
  ["Paused", "Paused"],
  ["Cancelled", "Cancelled"],
] as const;

export default async function AutopayPage({ searchParams }: PageProps<"/autopay">) {
  const u = await requirePermission("autopay.manage");
  const sp = await searchParams;
  const f = FILTERS.some(([k]) => k === sp.f) ? (sp.f as string) : "all";
  const today = todayIso();
  const [mode, mandates, tax] = await Promise.all([getAutopayMode(u.orgId), listMandates(u), getTax(u.orgId)]);
  const showForm = sp.new === "1";
  const [members, plans] = showForm
    ? await Promise.all([memberOptions(u), db.membershipPlan.findMany({ where: { orgId: u.orgId, status: "ACTIVE" }, orderBy: { price: "asc" } })])
    : [[], []];
  // Autopay renewals: memberships sold by a debit.
  const debits = await db.membership.findMany({
    where: { type: "AUTOPAY", memberId: { in: mandates.map((m) => m.memberId) } },
    select: { memberId: true, planId: true, createdAt: true, invoice: { select: { payments: { where: { status: "SUCCESS" }, select: { amount: true, date: true } } } } },
  });
  const debitCount = (m: (typeof mandates)[number]) => debits.filter((d) => d.memberId === m.memberId && d.planId === m.planId && d.createdAt >= m.createdAt).length;
  const since = fromIso(addDays(today, -30));
  const recent = debits.flatMap((d) => d.invoice.payments).filter((p) => p.date >= since);

  const active = mandates.filter((m) => m.status === "Active");
  const in7 = active.filter((m) => m.nextDebitOn && m.nextDebitOn <= fromIso(addDays(today, 7)));
  const bad = mandates.filter((m) => BAD.includes(m.status));
  const kpis: [string, string, string, boolean?][] = [
    ["Active mandates", String(active.length), `${mandates.filter((m) => m.status === "Pending").length} awaiting approval`],
    ["Recurring value", formatRupees(active.reduce((a, m) => a + m.amount, 0)), "per cycle across active mandates"],
    ["Debits in 7 days", String(in7.length), `${formatRupees(in7.reduce((a, m) => a + m.amount, 0))} expected`],
    ["Collected · 30 days", formatRupees(recent.reduce((a, p) => a + p.amount, 0)), `${recent.length} autopay debits`],
    ["Need attention", String(bad.length), bad.length ? "failed or halted" : "all clear", bad.length > 0],
  ];
  const rows = mandates
    .filter((m) => f === "all" || (f === "attention" ? [...BAD, "Pending"].includes(m.status) : m.status === f))
    .sort((a, b) => (BAD.includes(a.status) ? 0 : 1) - (BAD.includes(b.status) ? 0 : 1) || +(a.nextDebitOn ?? 0) - +(b.nextDebitOn ?? 0));
  const upcoming = active.filter((m) => m.nextDebitOn && m.nextDebitOn >= fromIso(today)).sort((a, b) => +a.nextDebitOn! - +b.nextDebitOn!).slice(0, 6);
  const when = (d: Date) => {
    const iso = d.toISOString().slice(0, 10);
    return iso === today ? "Today" : iso === addDays(today, 1) ? "Tomorrow" : fmtDate(iso);
  };
  const missing = mode === "live" ? razorpayReady() : null;
  const how =
    mode === "live"
      ? ["Member approves the mandate once in any UPI app from the WhatsApp link.", "Razorpay sends the pre-debit notice 24 hours before and charges on the renewal date.", "Fitron records the renewal, invoice and payment from the Razorpay webhook and sends the invoice on WhatsApp.", "Failures are retried by Razorpay; halted mandates show here for manual collection."]
      : ["Member approves the mandate once in their UPI app (use Approve (demo) to simulate it).", "A pre-debit notice goes out on WhatsApp 24 hours before each debit.", "Debits run with the daily jobs on the renewal date and create the renewal, invoice and payment.", "Failed debits are retried, then halt for manual collection."];

  return (
    <div className="flex flex-col gap-[26px] pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] tracking-[0.1em] text-muted uppercase">{mode === "live" ? "Live · Razorpay UPI Autopay" : "Demo mode · debits are simulated inside Fitron"}</div>
          <h1 className="mt-1 text-[28px] lg:text-[40px]">UPI autopay</h1>
        </div>
        <LinkButton href="/autopay?new=1#new" variant="primary">
          <PlusIcon size={16} weight="duotone" />
          New mandate
        </LinkButton>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,170px),1fr))] gap-x-8 gap-y-[22px]">
        {kpis.map(([k, v, sub, alert]) => (
          <div key={k}>
            <div className="text-[11px] tracking-[0.08em] text-muted uppercase">{k}</div>
            <div className={cx("mt-1 text-[28px] leading-[1.15] font-semibold", alert && "text-alert-700")}>{v}</div>
            <div className="mt-0.5 text-[12.5px] text-muted">{sub}</div>
          </div>
        ))}
      </div>

      {missing && <Notice tone="alert">Live mode, but {missing}</Notice>}

      {showForm && (
        <section id="new" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-[18px]">
          <h3 className="text-lg">New mandate</h3>
          <MandateForm
            members={members}
            plans={plans.map((p) => ({ id: p.id, label: `${p.name} · ${formatInr(invoiceTotals([{ qty: 1, rate: p.price, discount: p.discount, taxRate: tax.enabled && p.gstApplicable ? tax.rate : 0 }]).total)} every ${p.months} month${p.months > 1 ? "s" : ""}` }))}
          />
        </section>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-12 gap-y-6">
        <div>
          <h3 className="mb-2.5 text-lg">How it works</h3>
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm leading-relaxed">
            {how.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
        </div>
        {upcoming.length > 0 && (
          <div>
            <h3 className="mb-2.5 text-lg">Upcoming debits</h3>
            {upcoming.map((m) => (
              <div key={m.id} className="flex items-baseline justify-between gap-3 border-b border-line-soft py-2 text-sm">
                <span className="font-semibold">{m.member.name}</span>
                <span className="whitespace-nowrap">
                  <span className="mr-2.5 text-muted">{when(m.nextDebitOn!)}</span>
                  <strong>{formatRupees(m.amount)}</strong>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Segmented options={FILTERS.map(([k, label]) => ({ key: k, label, href: k === "all" ? "/autopay" : `/autopay?f=${k}` }))} current={f} />

      {rows.length === 0 ? (
        <div className="text-sm text-muted">{mandates.length ? "No mandates match this filter." : "No autopay mandates yet."}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className={cx(TABLE, "min-w-[1000px]")}>
            <thead>
              <tr>
                <th className={TH}>Member</th>
                <th className={TH}>Mandate</th>
                <th className={TH}>Plan · cycle</th>
                <th className={cx(TH, "text-right")}>Amount</th>
                <th className={TH}>Next debit</th>
                <th className={TH}>Debits</th>
                <th className={TH}>Last result</th>
                <th className={TH}>Status</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const isBad = BAD.includes(m.status);
                const soon = m.status === "Active" && m.nextDebitOn && m.nextDebitOn <= fromIso(addDays(today, 2));
                return (
                  <tr key={m.id} className={cx(TR, isBad && "bg-alert-soft/60")}>
                    <td className={cx(TD, "whitespace-nowrap")}>
                      <Link href={`/members/${m.member.id}`} className="flex items-center gap-2.5 hover:text-accent">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-strong">{initials(m.member.name)}</span>
                        <span>
                          <span className="block font-semibold">{m.member.name}</span>
                          <span className="block text-xs text-muted">{m.member.code}</span>
                        </span>
                      </Link>
                    </td>
                    <td className={cx(TD, "text-[13px]")}>
                      <Link href={`/autopay/${m.id}`} className="hover:text-accent">
                        {m.code}
                      </Link>
                      <div className="text-[11.5px] whitespace-nowrap text-muted">
                        {m.mode === "live" ? "Razorpay" : "Demo"}
                        {m.subscriptionId ? ` · ${m.subscriptionId}` : ""}
                      </div>
                    </td>
                    <td className={cx(TD, "text-[13px] whitespace-nowrap")}>
                      {m.planName} · {m.months === 1 ? "Monthly" : `every ${m.months} months`}
                    </td>
                    <td className={cx(TD, "text-right font-semibold whitespace-nowrap")}>{formatRupees(m.amount)}</td>
                    <td className={cx(TD, "whitespace-nowrap", soon && "font-semibold")}>{m.status === "Active" && m.nextDebitOn ? fmtDate(m.nextDebitOn) : isBad && m.nextDebitOn ? `Retry ${fmtDate(m.nextDebitOn)}` : "—"}</td>
                    <td className={cx(TD, "text-center")}>{debitCount(m)}</td>
                    <td className={cx(TD, "max-w-[260px] text-[12.5px]")}>{m.lastResult}</td>
                    <td className={TD}>
                      <Tag label={m.status === "Pending" ? "Pending approval" : m.status} />
                    </td>
                    <td className={cx(TD, "text-right whitespace-nowrap")}>
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        {m.status === "Pending" && m.mode === "demo" && <MandateButton id={m.id} action="approve-demo" label="Approve (demo)" variant="primary" />}
                        {m.status === "Pending" && m.shortUrl && (
                          <a href={m.shortUrl} target="_blank" rel="noopener" className="inline-flex min-h-[38px] items-center rounded-md px-1.5 text-sm font-semibold text-accent hover:bg-accent/10">
                            Approval link
                          </a>
                        )}
                        {isBad && u.can("payments.collect") && (
                          <LinkButton href={`/members/${m.member.id}`} className="text-[12.5px]">
                            Collect manually
                          </LinkButton>
                        )}
                        {m.status === "Active" && <MandateButton id={m.id} action="pause" label="Pause" variant="ghost" />}
                        {m.status === "Paused" && <MandateButton id={m.id} action="resume" label="Resume" variant="ghost" />}
                        {m.status !== "Cancelled" && <MandateButton id={m.id} action="cancel" label="Cancel" variant="ghost" confirm={`Cancel autopay ${m.code} for ${m.member.name}? This can't be undone.`} />}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
