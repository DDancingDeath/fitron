"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui";
import { formatInr } from "@/lib/format";
import { branchPrice } from "@/lib/domain/saas";
import { confirmCheckoutAction, confirmDemoAction, startPaymentAction } from "./actions";

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type RazorpayCtor = new (o: Record<string, unknown>) => {
  open(): void;
  on(ev: string, fn: (r: { error?: { description?: string } }) => void): void;
};

function loadCheckout(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => (w.Razorpay ? res(w.Razorpay) : rej(new Error("Checkout didn't load")));
    s.onerror = () => rej(new Error("Couldn't load Razorpay Checkout. Check the internet connection."));
    document.head.appendChild(s);
  });
}

/** Pay Fitron for an extra branch (new slot, or renewing `branchId`). */
export function PayButton({ branchId, label }: { branchId: string | null; label: string }) {
  const router = useRouter();
  const [cycle, setCycle] = useState<"YEARLY" | "MONTHLY">("YEARLY");
  const [msg, setMsg] = useState<{ tone: "ok" | "alert"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const done = (r: { ok: boolean; error?: string }) => {
    if (!r.ok) return setMsg({ tone: "alert", text: r.error ?? "Payment failed." });
    setMsg({
      tone: "ok",
      text: branchId ? "Paid. The branch is renewed." : "Paid. Now add the new branch in Settings › Branches.",
    });
    router.refresh();
  };

  const pay = () =>
    start(async () => {
      setMsg(null);
      const r = await startPaymentAction(cycle, branchId);
      if (!r.ok) return setMsg({ tone: "alert", text: r.error });
      const c = r.data;
      if (c.mode === "DEMO") {
        if (!window.confirm(`Demo mode: Fitron's Razorpay keys aren't set, so no money is charged. Mark ${formatInr(c.total)} as paid?`)) return;
        return done(await confirmDemoAction(c.id));
      }
      try {
        const Razorpay = await loadCheckout();
        const rz = new Razorpay({
          key: c.keyId,
          order_id: c.orderId,
          amount: c.total,
          currency: "INR",
          name: c.name,
          description: c.description,
          prefill: c.prefill,
          theme: { color: "#cfa94f" },
          handler: (resp: RazorpayResponse) =>
            start(async () =>
              done(
                await confirmCheckoutAction({
                  orderId: resp.razorpay_order_id,
                  paymentId: resp.razorpay_payment_id,
                  signature: resp.razorpay_signature,
                }),
              ),
            ),
        });
        rz.on("payment.failed", (e) =>
          setMsg({
            tone: "alert",
            text: e.error?.description ?? "The payment failed. No money was taken.",
          }),
        );
        rz.open();
      } catch (e) {
        setMsg({ tone: "alert", text: (e as Error).message });
      }
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={cycle} onChange={(e) => setCycle(e.target.value as "YEARLY" | "MONTHLY")} aria-label="Billing cycle" className="w-auto">
          <option value="YEARLY">Yearly · {formatInr(branchPrice("YEARLY").total)}</option>
          <option value="MONTHLY">Monthly · {formatInr(branchPrice("MONTHLY").total)}</option>
        </Select>
        <Button variant="primary" onClick={pay} disabled={pending} type="button">
          {pending ? "Working…" : label}
        </Button>
      </div>
      {msg && <p className={msg.tone === "ok" ? "text-sm text-ok" : "text-sm text-alert"}>{msg.text}</p>}
    </div>
  );
}
