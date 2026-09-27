"use client";

import { useActionState, useState } from "react";
import { cancel, collect, reverse } from "../../billing-actions";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { METHODS } from "@/lib/validation/billing";

export function CollectForm({ invoiceId, balance, today }: { invoiceId: string; balance: number; today: string }) {
  const [state, action, pending] = useActionState(collect.bind(null, invoiceId), undefined);
  const e = state?.errors ?? {};
  const sent = state?.ok ? undefined : (state?.values as Record<string, string> | undefined);
  return (
    <form action={action} key={state?.nonce} className="flex flex-col gap-3">
      {state?.message && <Notice tone={state.ok ? "ok" : "alert"}>{state.message}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (₹)" error={e.amount}>
          <Input name="amount" inputMode="decimal" defaultValue={sent?.amount ?? String(balance / 100)} required />
        </Field>
        <Field label="Method" error={e.method}>
          <Select name="method" defaultValue={sent?.method ?? "UPI"}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date" error={e.date}>
          <Input name="date" type="date" defaultValue={sent?.date ?? today} max={today} required />
        </Field>
        <Field label="Reference" error={e.txnRef}>
          <Input name="txnRef" defaultValue={sent?.txnRef} />
        </Field>
      </div>
      <div>
        <Button variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}

function ReasonForm({ action: act, label, confirm, done }: { action: (s: unknown, fd: FormData) => Promise<{ ok?: boolean; message?: string; errors?: Record<string, string[] | undefined> } | undefined>; label: string; confirm: string; done?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(act, undefined);
  if (state?.ok) return <Notice tone="ok">{state.message}</Notice>;
  if (done) return null;
  if (!open)
    return (
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  return (
    <form
      action={action}
      onSubmit={(ev) => {
        if (!window.confirm(confirm)) ev.preventDefault();
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <Field label="Reason" error={state?.errors?.reason} className="flex-1">
        <Input name="reason" required minLength={3} autoFocus />
      </Field>
      {state?.message && <Notice tone="alert">{state.message}</Notice>}
      <div className="flex gap-2">
        <Button variant="danger" disabled={pending}>
          {label}
        </Button>
        <Button type="button" onClick={() => setOpen(false)}>
          Keep
        </Button>
      </div>
    </form>
  );
}

export function CancelInvoice({ invoiceId }: { invoiceId: string }) {
  return (
    <ReasonForm
      action={cancel.bind(null, invoiceId) as never}
      label="Cancel invoice"
      confirm="Cancel this invoice? Its payments will be reversed and any membership on it cancelled."
    />
  );
}

export function ReversePayment({ paymentId, invoiceId }: { paymentId: string; invoiceId: string }) {
  return <ReasonForm action={reverse.bind(null, paymentId, invoiceId) as never} label="Reverse" confirm="Reverse this payment?" />;
}
