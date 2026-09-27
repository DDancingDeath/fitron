"use client";

import { useActionState } from "react";
import { checkInAction, guestAction, type CheckInState } from "./actions";
import { Button, Field, Input, Notice } from "@/components/ui";

export function CheckInButton({ memberId }: { memberId: string }) {
  const [state, action, pending] = useActionState<CheckInState, FormData>(checkInAction.bind(null, memberId), undefined);
  if (state?.ok) return <Notice tone="ok">{state.message}</Notice>;
  if (state?.blocked)
    return (
      <form action={action} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
        <Notice tone="alert">Blocked: {state.blocked}</Notice>
        <Field label="Let in anyway because…" className="sm:w-64">
          <Input name="override" required minLength={3} autoFocus />
        </Field>
        <Button variant="danger" disabled={pending}>
          Allow entry
        </Button>
      </form>
    );
  return (
    <form action={action} className="flex items-center gap-2">
      {state?.message && <span className="text-sm text-alert">{state.message}</span>}
      <Button variant="primary" disabled={pending}>
        {pending ? "Checking…" : "Check in"}
      </Button>
    </form>
  );
}

export function GuestForm() {
  const [state, action, pending] = useActionState(guestAction, undefined);
  const e = state?.errors ?? {};
  const sent = state?.ok ? undefined : (state?.values as Record<string, string> | undefined);
  return (
    <form action={action} key={state?.nonce} className="flex flex-col gap-3">
      {state?.message && <Notice tone={state.ok ? "ok" : "alert"}>{state.message}</Notice>}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Guest name" error={e.name}>
          <Input name="name" defaultValue={sent?.name} required />
        </Field>
        <Field label="Mobile (optional)" error={e.phone}>
          <Input name="phone" inputMode="tel" defaultValue={sent?.phone} />
        </Field>
        <Button disabled={pending}>Check in guest</Button>
      </div>
    </form>
  );
}
