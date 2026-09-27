"use server";

import * as z from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import type { FormState } from "@/lib/validation/common";

const loginInput = z.object({
  email: z.email({ error: "Enter your email." }).transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1, { error: "Enter your password." }),
});

// Verifying against a dummy hash keeps timing the same for unknown emails.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("not-a-real-password"));

type LoginState = (FormState & { email?: string }) | undefined;

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`login:${ip}`, 5, 60_000)) return { email, message: "Too many attempts. Wait a minute and try again." };

  const parsed = loginInput.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { email, errors: z.flattenError(parsed.error).fieldErrors };

  const user = await db.user.findFirst({ where: { email: parsed.data.email, active: true, deletedAt: null } });
  const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), parsed.data.password);
  if (!user || !ok) return { email, message: "That email and password don't match." };

  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
