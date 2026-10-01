"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requirePermission } from "@/lib/auth/current";
import { confirmCheckout, confirmDemoPayment, startPayment, submitUtr, type Checkout } from "@/lib/services/saas";
import { UserError } from "@/lib/services/errors";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error("Fitron billing failed", e);
    return { ok: false, error: "Couldn't start the payment. Try again in a minute." };
  }
}

const For = z.discriminatedUnion("kind", [z.object({ kind: z.literal("PLAN"), plan: z.string().min(1) }), z.object({ kind: z.literal("BRANCH"), branchId: z.string().nullable() })]);

export async function startPaymentAction(what: unknown, cycle: string): Promise<Result<Checkout>> {
  const u = await requirePermission("settings.manage");
  const c = z.enum(["MONTHLY", "YEARLY"]).safeParse(cycle);
  if (!c.success) return { ok: false, error: "Pick monthly or yearly." };
  const w = For.safeParse(what);
  if (!w.success) return { ok: false, error: "Pick what to pay for." };
  return wrap(() => startPayment(u, w.data, c.data));
}

export async function submitUtrAction(id: string, utr: string): Promise<Result> {
  const u = await requirePermission("settings.manage");
  const r = await wrap(() => submitUtr(u, id, utr));
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, data: null } : r;
}

export async function confirmDemoAction(id: string): Promise<Result> {
  const u = await requirePermission("settings.manage");
  const r = await wrap(() => confirmDemoPayment(u, id));
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, data: null } : r;
}

export async function confirmCheckoutAction(a: { orderId: string; paymentId: string; signature: string }): Promise<Result> {
  const u = await requirePermission("settings.manage");
  const r = await wrap(() => confirmCheckout(u, a));
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, data: null } : r;
}
