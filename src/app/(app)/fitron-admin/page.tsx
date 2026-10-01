import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { isFitronAdmin } from "@/lib/integrations/upi";
import { paymentsToCheck } from "@/lib/services/saas";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { fmtStamp, formatInr } from "@/lib/format";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Payment checks · FITRON" };

/** FITRON team only (FITRON_ADMIN_EMAILS): match each UTR a gym entered against the bank statement. */
export default async function FitronAdminPage() {
  const u = await requireUser();
  if (!isFitronAdmin(u.email)) notFound();
  const { waiting, recent } = await paymentsToCheck();

  return (
    <>
      <PageHeader title="UPI payments to check" subtitle="Find each UTR in your bank or UPI app for the same amount. Confirm only when the money is in." />
      <div className="flex flex-col gap-4">
        <Card title={`Waiting · ${waiting.length}`}>
          {waiting.length === 0 ? (
            <Empty>Nothing to check.</Empty>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {waiting.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{p.gym}</span>
                    <span className="text-base font-semibold tabular-nums">{formatInr(p.total)}</span>
                  </div>
                  <p>
                    UTR <strong className="font-mono">{p.utr}</strong> · {p.ref} · {p.what}, {p.cycle === "YEARLY" ? "yearly" : "monthly"} · entered {fmtStamp(p.submittedAt)}
                    {p.status === "REJECTED" && <Badge tone="alert">rejected before</Badge>}
                  </p>
                  <ReviewForm id={p.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recently checked">
          {recent.length === 0 ? (
            <Empty>None yet.</Empty>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {recent.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>
                      {p.gym} · UTR <span className="font-mono">{p.utr}</span> · {p.what} · {formatInr(p.total)}
                    </span>
                    {p.status === "PAID" ? <Badge tone="ok">Confirmed</Badge> : <Badge tone="alert">Rejected</Badge>}
                  </div>
                  <p className="text-muted">
                    {p.reviewedBy} · {fmtStamp(p.reviewedAt)}
                    {p.rejectReason ? ` · ${p.rejectReason}` : ""}
                  </p>
                  {p.status === "REJECTED" && <ReviewForm id={p.id} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
