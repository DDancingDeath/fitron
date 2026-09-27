import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { listRoles } from "@/lib/services/staff";
import { PageHeader } from "@/components/ui";
import { StaffForm } from "../staff-form";

export const metadata = { title: "Add staff · Fitron" };

export default async function NewStaff() {
  const u = await requirePermission("staff.manage");
  const [roles, branches] = await Promise.all([listRoles(), db.branch.findMany({ where: { orgId: u.orgId }, select: { id: true, name: true } })]);
  return (
    <>
      <PageHeader title="Add staff member" />
      <StaffForm roles={roles} branches={branches} />
    </>
  );
}
