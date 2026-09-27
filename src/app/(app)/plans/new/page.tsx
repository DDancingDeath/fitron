import { requirePermission } from "@/lib/auth/current";
import { PageHeader } from "@/components/ui";
import { PlanForm } from "../plan-form";

export const metadata = { title: "New plan · Fitron" };

export default async function NewPlan() {
  await requirePermission("plans.manage");
  return (
    <>
      <PageHeader title="New plan" />
      <PlanForm />
    </>
  );
}
