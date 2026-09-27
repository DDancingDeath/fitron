"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current";
import { memberInput } from "@/lib/validation/member";
import { failed, fieldErrors, type FormState } from "@/lib/validation/common";
import { createMember, deleteMember, setSuspended, updateMember } from "@/lib/services/members";
import { UserError } from "@/lib/services/errors";
import { enrol, eraseBiometrics } from "@/lib/services/biometric";

const read = (fd: FormData) => Object.fromEntries([...fd.keys()].map((k) => [k, fd.get(k)]));

async function handle(fd: FormData, fn: () => Promise<unknown>): Promise<FormState> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    if (e instanceof UserError) return failed(fd, { message: e.message, errors: e.field ? { [e.field]: [e.message] } : undefined });
    throw e;
  }
}

export async function saveMember(id: string | null, _: FormState, fd: FormData): Promise<FormState> {
  const u = await requirePermission(id ? "members.edit" : "members.create");
  const parsed = memberInput.safeParse(read(fd));
  if (!parsed.success) return failed(fd, { errors: fieldErrors(parsed.error), message: "Check the highlighted fields." });
  let newId = id;
  const res = await handle(fd, async () => {
    if (id) await updateMember(u, id, parsed.data);
    else newId = (await createMember(u, parsed.data, { leadId: (fd.get("leadId") as string) || undefined })).id;
  });
  if (!res?.ok) return res;
  revalidatePath("/members");
  redirect(`/members/${newId}`);
}

export async function toggleSuspend(id: string, suspend: boolean) {
  const u = await requirePermission("members.edit");
  await setSuspended(u, id, suspend);
  revalidatePath(`/members/${id}`);
}

export async function removeMember(id: string) {
  const u = await requirePermission("members.delete");
  await deleteMember(u, id);
  revalidatePath("/members");
  redirect("/members");
}

export async function enrolBiometric(id: string, fd: FormData) {
  const u = await requirePermission("members.edit");
  const kind = fd.get("kind") === "FACE" ? "FACE" : "FP";
  let error = "";
  try {
    await enrol(u, id, String(fd.get("deviceId") ?? ""), kind, fd.get("consent") === "on");
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    error = e.message;
  }
  revalidatePath(`/members/${id}`);
  redirect(`/members/${id}?${new URLSearchParams(error ? { bioError: error } : { bio: kind === "FP" ? "Ask the member to place their finger on the device three times." : "Ask the member to look at the device." })}#biometric`);
}

export async function eraseBiometric(id: string) {
  const u = await requirePermission("members.edit");
  await eraseBiometrics(u, id);
  revalidatePath(`/members/${id}`);
  redirect(`/members/${id}?${new URLSearchParams({ bio: "Biometric data deleted here and removed from every device." })}#biometric`);
}
