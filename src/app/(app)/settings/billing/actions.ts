"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requirePermission } from "@/lib/auth/current";
import { confirmCheckout, confirmDemoPayment, startBranchPayment, type Checkout } from "@/lib/services/saas";
import { UserError } from "@/lib/services/errors";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error("Branch billing failed", e);
    return { ok: false, error: "Couldn't reach the payment service. Try again in a minute." };
  }
}

export async function startPaymentAction(cycle: string, branchId: string | null): Promise<Result<Checkout>> {
  const u = await requirePermission("settings.manage");
  const c = z.enum(["MONTHLY", "YEARLY"]).safeParse(cycle);
  if (!c.success) return { ok: false, error: "Pick monthly or yearly." };
  return wrap(() => startBranchPayment(u, c.data, branchId));
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
