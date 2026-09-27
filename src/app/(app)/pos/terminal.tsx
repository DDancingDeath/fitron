"use client";

import { useActionState, useMemo, useState } from "react";
import { sellAction } from "./actions";
import { Button, Field, Input, Notice, Select, cx } from "@/components/ui";
import { formatInr } from "@/lib/format";
import { METHODS } from "@/lib/validation/billing";

type P = { id: string; name: string; category: string; price: number; stock: number | null; low: boolean; gst: boolean };

export function Terminal({ products, members, taxRate }: { products: P[]; members: { id: string; label: string }[]; taxRate: number }) {
  const [state, action, pending] = useActionState(sellAction, undefined);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const cats = [...new Set(products.map((p) => p.category))];
  const shown = products.filter((p) => (!cat || p.category === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ p: products.find((x) => x.id === id)!, qty }))
    .filter((l) => l.p && l.qty > 0);
  const totals = useMemo(() => {
    let net = 0;
    let tax = 0;
    for (const l of lines) {
      const n = l.p.price * l.qty;
      net += n;
      tax += l.p.gst ? Math.round((n * taxRate) / 100) : 0;
    }
    return { net, tax, total: net + tax };
  }, [lines, taxRate]);
  const add = (p: P, d = 1) =>
    setCart((c) => {
      const next = Math.max(0, Math.min((c[p.id] ?? 0) + d, p.stock ?? 999));
      return { ...c, [p.id]: next };
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <section>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" aria-label="Search products" />
          <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" className="sm:w-48">
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shown.map((p) => {
            const out = p.stock !== null && p.stock <= (cart[p.id] ?? 0);
            return (
              <button
                key={p.id}
                type="button"
                disabled={out}
                onClick={() => add(p)}
                className={cx("rounded-xl border bg-surface p-3 text-left transition", out ? "cursor-not-allowed border-line opacity-50" : "border-line hover:border-accent")}
              >
                <span className="block font-semibold leading-tight">{p.name}</span>
                <span className="mt-1 block text-sm text-muted">{formatInr(p.price)}</span>
                <span className={cx("mt-1 block text-xs", p.low ? "text-alert" : "text-muted")}>{p.stock === null ? "No stock tracking" : p.stock === 0 ? "Out of stock" : `${p.stock} in stock`}</span>
              </button>
            );
          })}
        </div>
      </section>
      <form action={action} className="flex flex-col gap-3 self-start rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-4">
        <h2 className="font-semibold">Bill</h2>
        {state?.message && <Notice tone="alert">{state.message}</Notice>}
        {lines.length === 0 ? (
          <p className="text-sm text-muted">Tap a product to add it.</p>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map(({ p, qty }) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <Button type="button" variant="ghost" onClick={() => add(p, -1)} aria-label={`One less ${p.name}`}>
                  −
                </Button>
                <span className="w-6 text-center tabular-nums">{qty}</span>
                <Button type="button" variant="ghost" onClick={() => add(p)} aria-label={`One more ${p.name}`} disabled={p.stock !== null && qty >= p.stock}>
                  +
                </Button>
                <span className="w-24 text-right tabular-nums">{formatInr(p.price * qty)}</span>
              </li>
            ))}
          </ul>
        )}
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="text-muted">Subtotal</dt>
          <dd className="text-right tabular-nums">{formatInr(totals.net)}</dd>
          <dt className="text-muted">GST</dt>
          <dd className="text-right tabular-nums">{formatInr(totals.tax)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="text-right text-lg font-semibold tabular-nums">{formatInr(totals.total)}</dd>
        </dl>
        <input type="hidden" name="items" value={JSON.stringify(lines.map((l) => ({ productId: l.p.id, qty: l.qty })))} />
        <Field label="Member (leave blank for a walk-in customer)" error={state?.errors?.member}>
          <Input name="member" list="pos-members" placeholder="Member ID or name" autoComplete="off" />
          <datalist id="pos-members">
            {members.map((m) => (
              <option key={m.id} value={m.label} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Paid by">
            <Select name="method" defaultValue="Cash">
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Reference">
            <Input name="txnRef" placeholder="UPI ref, optional" />
          </Field>
        </div>
        <Button variant="primary" disabled={pending || lines.length === 0}>
          {pending ? "Recording…" : `Take ${formatInr(totals.total)}`}
        </Button>
        {lines.length > 0 && (
          <Button type="button" variant="ghost" onClick={() => setCart({})}>
            Clear bill
          </Button>
        )}
      </form>
    </div>
  );
}
