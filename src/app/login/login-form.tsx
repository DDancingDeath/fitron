"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Button, Field, Input, Notice } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message && <Notice tone="alert">{state.message}</Notice>}
      <Field label="Email" error={state?.errors?.email}>
        <Input name="email" type="email" autoComplete="username" required autoFocus defaultValue={state?.email} key={state?.email} />
      </Field>
      <Field label="Password" error={state?.errors?.password}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button variant="primary" disabled={pending} className="mt-2 min-h-12">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
