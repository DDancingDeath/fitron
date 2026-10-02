"use client";

import { useActionState, useMemo, useState } from "react";
import { sellAction } from "./actions";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { formatInr, formatRupees } from "@/lib/format";
import { METHODS } from "@/lib/validation/billing";

type P = { id: string; sku: string; name: string; category: string; price: number; stock: number | null; low: boolean; gst: boolean };

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

  // Enter adds the product whose SKU was typed or scanned, or the only match.
  const scan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const t = q.trim().toLowerCase();
    const hit = products.find((p) => p.sku.toLowerCase() === t) ?? (shown.length === 1 ? shown[0] : undefined);
    if (hit) {
      add(hit);
      setQ("");
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-10">
      <section className="flex min-w-0 flex-[1_1_380px] flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={scan} placeholder="Search product or scan barcode, then Enter" aria-label="Search products" />
          <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" className="sm:w-48">
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {shown.map((p) => {
            const out = p.stock !== null && p.stock <= (cart[p.id] ?? 0);
            return (
              <button
                key={p.id}
                type="button"
                disabled={out}
                onClick={() => add(p)}
                className="flex min-h-24 flex-col gap-1 rounded-md bg-surface p-3 text-left hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-[11px] tracking-[0.08em] text-muted uppercase">{p.category}</span>
                <span className="flex-1 text-sm font-semibold">{p.name}</span>
                <span className="flex justify-between text-[13px]">
                  <span>{formatRupees(p.price)}</span>
                  <span className={p.low || p.stock === 0 ? "text-alert-700" : "text-muted"}>{p.stock === null ? "Service" : `${p.stock} left`}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <form action={action} className="flex w-full min-w-0 flex-col gap-3 rounded-lg bg-surface px-[18px] py-4 lg:sticky lg:top-4 lg:w-[320px] lg:flex-none">
        <h3 className="text-xl">Current sale</h3>
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
        <Field label="Customer (blank for a walk-in)" error={state?.errors?.member}>
          <Input name="member" list="pos-members" placeholder="Search name, member ID or phone" autoComplete="off" />
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
          {pending ? "Recording…" : `Charge ${formatInr(totals.total)}`}
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
