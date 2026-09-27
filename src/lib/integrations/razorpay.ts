import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay Subscriptions (UPI Autopay). Keys live only in the server environment:
// RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.

const env = (k: string) => process.env[k]?.trim() || "";
export const razorpayReady = () => (env("RAZORPAY_KEY_ID") && env("RAZORPAY_KEY_SECRET") ? null : "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set on the server.");

async function rzp<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const missing = razorpayReady();
  if (missing) throw new Error(missing);
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`).toString("base64")}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new Error(json.error?.description ?? `Razorpay returned ${res.status}`);
  return json;
}

/** A plan that charges `amount` paise every `months` months. */
export const createPlan = (amount: number, months: number, name: string) =>
  rzp<{ id: string }>("POST", "/plans", { period: "monthly", interval: months, item: { name, amount, currency: "INR" } }).then((p) => p.id);

export type Subscription = { id: string; short_url?: string; status: string; charge_at?: number | null };

export const createSubscription = (a: { planId: string; startAt?: Date; notes: Record<string, string> }) =>
  rzp<Subscription>("POST", "/subscriptions", {
    plan_id: a.planId,
    total_count: 120,
    quantity: 1,
    customer_notify: 1,
    ...(a.startAt && a.startAt.getTime() > Date.now() + 60_000 ? { start_at: Math.floor(a.startAt.getTime() / 1000) } : {}),
    notes: a.notes,
  });

export const subscriptionAction = (id: string, action: "pause" | "resume" | "cancel") =>
  rzp<Subscription>("POST", `/subscriptions/${id}/${action}`, action === "pause" ? { pause_at: "now" } : action === "resume" ? { resume_at: "now" } : { cancel_at_cycle_end: 0 });

/** Razorpay signs the raw request body with the webhook secret (HMAC-SHA256, hex). */
export function verifyWebhook(rawBody: string, signature: string | null, secret = env("RAZORPAY_WEBHOOK_SECRET")) {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
