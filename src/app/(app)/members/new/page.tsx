import { requirePermission } from "@/lib/auth/current";
import { listTrainers } from "@/lib/services/staff";
import { PageHeader } from "@/components/ui";
import { MemberForm } from "../member-form";

export const metadata = { title: "Add member · Fitron" };

export default async function NewMember() {
  const u = await requirePermission("members.create");
  return (
    <>
      <PageHeader title="Add member" subtitle="The member ID is assigned when you save." />
      <MemberForm trainers={await listTrainers(u)} />
    </>
  );
}
