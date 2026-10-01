"use client";

import { useActionState } from "react";
import { sendContact } from "../actions";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { TOPICS } from "@/lib/validation/site";

export function ContactForm({ topic }: { topic: string }) {
  const [state, action, pending] = useActionState(sendContact, undefined);
  const sent = state?.ok ? undefined : state?.values;
  const e = state?.errors ?? {};
  const v = (k: string) => sent?.[k] as string | undefined;
  if (state?.ok) return <Notice tone="ok">{state.message}</Notice>;
  return (
    <form action={action} key={state?.nonce} className="flex flex-col gap-4" noValidate>
      {state?.message && <Notice tone="alert">{state.message}</Notice>}
      <Field label="Topic" error={e.topic}>
        <Select name="topic" defaultValue={v("topic") ?? topic} required>
          {Object.entries(TOPICS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" error={e.name}>
          <Input name="name" autoComplete="name" defaultValue={v("name")} required />
        </Field>
        <Field label="Email" error={e.email}>
          <Input name="email" type="email" autoComplete="email" defaultValue={v("email")} required />
        </Field>
        <Field label="Mobile (optional)" error={e.phone}>
          <Input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" defaultValue={v("phone")} />
        </Field>
        <Field label="Gym or business (optional)" error={e.business}>
          <Input name="business" autoComplete="organization" defaultValue={v("business")} />
        </Field>
      </div>
      <Field label="Message" error={e.message}>
        <Textarea name="message" rows={5} defaultValue={v("message")} required />
      </Field>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <Button variant="primary" disabled={pending} className="min-h-12 sm:self-start">
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
