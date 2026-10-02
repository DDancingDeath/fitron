"use client";

import { useActionState, useState } from "react";
import { signUpGym } from "../account-actions";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { PLANS, findPlan, rupeesLabel, type Cycle } from "@/lib/domain/pricing";

const gymPlans = PLANS.filter((p) => p.product === "GYM_ACCOUNTING");

/** `google`: the account Google verified; the email is fixed and no password is needed. */
export function GymSignupForm({ plan: initialPlan, cycle: initialCycle, google }: { plan: string; cycle: Cycle; google?: { email: string; name: string } }) {
  const [state, action, pending] = useActionState(signUpGym, undefined);
  const sent = state?.values;
  const [plan, setPlan] = useState((sent?.plan as string) ?? initialPlan);
  const [cycle, setCycle] = useState<Cycle>(((sent?.cycle as Cycle) ?? initialCycle) === "YEARLY" ? "YEARLY" : "MONTHLY");
  const [show, setShow] = useState(false);
  const e = state?.errors ?? {};
  const v = (k: string) => sent?.[k] as string | undefined;
  const p = findPlan(plan)!;

  return (
    <form action={action} key={state?.nonce} className="flex flex-col gap-4" noValidate>
      {state?.message && <Notice tone="alert">{state.message}</Notice>}
      <Field label="Plan" error={e.plan}>
        <Select name="plan" value={plan} onChange={(ev) => setPlan(ev.target.value)} required>
          {gymPlans.map((x) => (
            <option key={x.key} value={x.key}>
              {x.name} · {x.memberLimit ? `up to ${x.memberLimit} members` : "unlimited members, multi-branch"}
            </option>
          ))}
        </Select>
      </Field>
      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1.5 font-semibold">After the free trial</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["MONTHLY", "YEARLY"] as const).map((c) => (
            <label key={c} className={`flex cursor-pointer flex-col rounded-md border px-3 py-2 ${cycle === c ? "border-accent bg-accent-soft" : "border-line"}`}>
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="cycle" value={c} checked={cycle === c} onChange={() => setCycle(c)} />
                {c === "MONTHLY" ? "Monthly" : "Yearly"}
              </span>
              <span className="text-muted">
                {rupeesLabel(p.price[c])} / {c === "MONTHLY" ? "month" : "year"}
              </span>
            </label>
          ))}
        </div>
        {e.cycle?.map((m) => <span key={m} className="text-xs text-alert">{m}</span>)}
      </fieldset>
      <Field label="Gym name" error={e.business}>
        <Input name="business" autoComplete="organization" defaultValue={v("business")} required />
      </Field>
      <Field label="Your name" error={e.name}>
        <Input name="name" autoComplete="name" defaultValue={v("name") ?? google?.name} required />
      </Field>
      {google ? (
        <Field label="Email" error={e.email} hint="Confirmed by Google. You'll sign in with Google.">
          <Input name="email" type="email" value={google.email} readOnly />
        </Field>
      ) : (
        <Field label="Email" error={e.email} hint="You'll log in with this. We send a link to confirm it.">
          <Input name="email" type="email" autoComplete="email" defaultValue={v("email")} required />
        </Field>
      )}
      <Field label="Mobile" error={e.phone} hint="10 digits.">
        <Input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" defaultValue={v("phone")} required />
      </Field>
      <Field label="City (optional)" error={e.city}>
        <Input name="city" autoComplete="address-level2" defaultValue={v("city")} />
      </Field>
      {!google && <Field label="Password" error={e.password} hint="At least 10 characters.">
        <div className="flex gap-2">
          <Input name="password" type={show ? "text" : "password"} autoComplete="new-password" required minLength={10} />
          <Button type="button" onClick={() => setShow(!show)} aria-pressed={show} className="shrink-0">
            {show ? "Hide" : "Show"}
          </Button>
        </div>
      </Field>}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="terms" className="mt-1" defaultChecked={v("terms") === "on"} required />
        <span>
          I agree to the <a href="/terms" target="_blank" className="underline">Terms</a> and <a href="/privacy" target="_blank" className="underline">Privacy Policy</a>.
          {e.terms?.map((m) => <span key={m} className="block text-xs text-alert">{m}</span>)}
        </span>
      </label>
      <Button variant="primary" disabled={pending} className="mt-2 min-h-12">
        {pending ? "Creating your console…" : "Start my 7-day free trial"}
      </Button>
      <p className="text-xs text-muted">No card needed. Prices exclude 18% GST. Nothing is charged unless you choose to pay when the trial ends.</p>
    </form>
  );
}
