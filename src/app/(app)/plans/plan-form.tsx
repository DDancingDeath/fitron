"use client";

import { useActionState } from "react";
import { savePlan } from "./actions";
import { Button, Card, Field, Input, LinkButton, Notice, Select, Textarea } from "@/components/ui";
import { PLAN_KINDS } from "@/lib/validation/plan";

export type PlanValues = {
  name: string;
  kind: string;
  months: number;
  price: number;
  regFee: number;
  discount: number;
  gstApplicable: boolean;
  description: string | null;
  features: string[];
};

const rs = (paise?: number) => (paise == null ? "" : String(paise / 100));

export function PlanForm({ id, values }: { id?: string; values?: PlanValues }) {
  const [state, action, pending] = useActionState(savePlan.bind(null, id ?? null), undefined);
  const e = state?.errors ?? {};
  const sent = state?.values as Record<string, string> | undefined;
  const pick = <T,>(k: string, fallback: T) => (sent ? (sent[k] ?? "") : fallback);
  return (
    <form action={action} key={state?.nonce} className="flex flex-col gap-4">
      {state?.message && <Notice tone="alert">{state.message}</Notice>}
      {id && <Notice>Price changes apply to new sales only. Existing memberships keep the price they were sold at.</Notice>}
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan name" error={e.name}>
            <Input name="name" defaultValue={pick("name", values?.name)} required placeholder="Quarterly" />
          </Field>
          <Field label="Type" error={e.kind}>
            <Select name="kind" defaultValue={pick("kind", values?.kind ?? "Membership")}>
              {PLAN_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </Select>
          </Field>
          <Field label="Duration (months)" error={e.months}>
            <Input name="months" type="number" min={1} max={60} defaultValue={pick("months", values?.months ?? 1)} required />
          </Field>
          <Field label="Price (₹)" error={e.price}>
            <Input name="price" inputMode="decimal" defaultValue={pick("price", rs(values?.price))} required />
          </Field>
          <Field label="Registration fee (₹)" error={e.regFee}>
            <Input name="regFee" inputMode="decimal" defaultValue={pick("regFee", rs(values?.regFee ?? 0))} />
          </Field>
          <Field label="Standard discount (₹)" error={e.discount}>
            <Input name="discount" inputMode="decimal" defaultValue={pick("discount", rs(values?.discount ?? 0))} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="gstApplicable" defaultChecked={sent ? sent.gstApplicable === "on" : (values?.gstApplicable ?? true)} className="size-4 accent-[var(--accent)]" />
            GST applies to this plan
          </label>
          <Field label="Description" error={e.description} className="sm:col-span-2">
            <Textarea name="description" defaultValue={pick("description", values?.description ?? "")} />
          </Field>
          <Field label="What's included" error={e.features} hint="One per line" className="sm:col-span-2">
            <Textarea name="features" defaultValue={pick("features", values?.features.join("\n"))} />
          </Field>
        </div>
      </Card>
      <div className="flex gap-2">
        <Button variant="primary" disabled={pending}>
          {pending ? "Saving…" : id ? "Save plan" : "Create plan"}
        </Button>
        <LinkButton href="/plans">Cancel</LinkButton>
      </div>
    </form>
  );
}
