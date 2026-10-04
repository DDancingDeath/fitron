"use client";

import { useActionState } from "react";
import { addExpense, voidIt } from "./actions";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { ReasonForm } from "@/components/reason-form";
import { METHODS } from "@/lib/validation/billing";

export function ExpenseForm({ categories, today }: { categories: { id: string; name: string; group: string }[]; today: string }) {
  const [state, action, pending] = useActionState(addExpense, undefined);
  const e = state?.errors ?? {};
  const sent = state?.ok ? undefined : (state?.values as Record<string, string> | undefined);
  const groups = [...new Set(categories.map((c) => c.group))];
  return (
    <form action={action} key={state?.nonce} className="flex flex-col gap-3">
      {state?.message && <Notice tone={state.ok ? "ok" : "alert"}>{state.message}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" error={e.date}>
          <Input name="date" type="date" defaultValue={sent?.date ?? today} max={today} required />
        </Field>
        <Field label="Category" error={e.categoryId}>
          <Select name="categoryId" defaultValue={sent?.categoryId ?? ""} required>
            <option value="" disabled>
              Choose
            </option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {categories
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Amount (₹)" error={e.amount}>
          <Input name="amount" inputMode="decimal" defaultValue={sent?.amount} required />
        </Field>
        <Field label="Payment method" error={e.method}>
          <Select name="method" defaultValue={sent?.method ?? "Cash"}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Description" error={e.description} className="sm:col-span-2">
          <Input name="description" defaultValue={sent?.description} required />
        </Field>
        <Field label="Vendor" error={e.vendor}>
          <Input name="vendor" defaultValue={sent?.vendor} />
        </Field>
        <Field label="Invoice / bill no." error={e.billNo}>
          <Input name="billNo" defaultValue={sent?.billNo} />
        </Field>
      </div>
      <div>
        <Button variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save expense"}
        </Button>
      </div>
    </form>
  );
}

export function VoidExpense({ id }: { id: string }) {
  return <ReasonForm action={voidIt.bind(null, id)} label="Void" confirm="Void this expense? It stays on record but no longer counts." compact />;
}
