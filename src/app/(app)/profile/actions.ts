"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import { readSession } from "@/lib/auth/session";
import { formAction, simpleAction } from "@/lib/form-action";
import type { FormState } from "@/lib/validation/common";
import { passwordChangeInput, profileInput } from "@/lib/validation/profile";
import { changePassword, removeProfilePhoto, setProfilePhoto, updateProfile } from "@/lib/services/profile";

export async function saveProfile(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requireUser();
  const state = await formAction(fd, profileInput, (d) => updateProfile(u, d), "Profile saved.");
  if (state?.ok) revalidatePath("/", "layout");
  return state;
}

export async function savePassword(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requireUser();
  const session = await readSession();
  return formAction(fd, passwordChangeInput, (d) => changePassword(u, session?.id ?? null, d), "Password changed. Other devices have been signed out.");
}

/** Uploads a new photo, or removes it when the form sends intent=remove. */
export async function changePhoto(_: FormState, fd: FormData): Promise<FormState> {
  const u = await requireUser();
  const state =
    fd.get("intent") === "remove"
      ? await simpleAction(() => removeProfilePhoto(u), "Photo removed.")
      : await simpleAction(() => setProfilePhoto(u, fd.get("photo") as File), "Photo updated.");
  if (state?.ok) revalidatePath("/", "layout");
  return state;
}
