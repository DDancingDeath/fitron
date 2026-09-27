import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { listPlans } from "@/lib/services/plans";
import { Badge, Button, Empty, LinkButton, Notice, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatInr } from "@/lib/format";
import { changePlanStatus, removePlan } from "./actions";

export const metadata = { title: "Plans · Fitron" };

export default async function PlansPage({ searchParams }: PageProps<"/plans">) {
  const u = await requirePermission("plans.manage");
  const { error } = await searchParams;
  const plans = await listPlans(u);
  return (
    <>
      <PageHeader title="Plans & offers" actions={<LinkButton href="/plans/new" variant="primary">New plan</LinkButton>} />
      {typeof error === "string" && <div className="mb-4"><Notice tone="alert">{error}</Notice></div>}
      {plans.length === 0 ? (
        <Empty>No plans yet. Create the plans you sell, like Monthly, Quarterly and Annual.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="flex flex-col rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/plans/${p.id}/edit`} className="text-lg font-semibold hover:text-accent">
                    {p.name}
                  </Link>
                  <div className="text-sm text-muted">
                    {p.kind} · {p.months} {p.months === 1 ? "month" : "months"}
                  </div>
                </div>
                {p.status === "ACTIVE" ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}
              </div>
              <div className="mt-3 text-2xl font-semibold">{formatInr(p.price)}</div>
              <div className="text-sm text-muted">
                {p.regFee > 0 ? `+ ${formatInr(p.regFee)} registration` : "No registration fee"}
                {p.gstApplicable ? " · GST extra" : ""}
              </div>
              <div className="mt-1 text-sm text-muted">Sold {p._count.memberships} times</div>
              <div className="mt-4 flex gap-2">
                <LinkButton href={`/plans/${p.id}/edit`}>Edit</LinkButton>
                <form action={changePlanStatus.bind(null, p.id, p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>
                  <Button>{p.status === "ACTIVE" ? "Deactivate" : "Activate"}</Button>
                </form>
                {p._count.memberships === 0 && (
                  <form action={removePlan.bind(null, p.id)}>
                    <ConfirmButton variant="danger" confirm={`Delete the ${p.name} plan?`}>
                      Delete
                    </ConfirmButton>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
