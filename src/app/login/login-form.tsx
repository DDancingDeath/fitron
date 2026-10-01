"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "./actions";
import { Button, Field, Input, Notice } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message && (
        <Notice tone="alert">
          {state.message}
          {state.unverified && (
            <>
              {" "}
              <Link href={`/verify-email?sent=${encodeURIComponent(state.email ?? "")}`} className="underline">
                Send a new link
              </Link>
            </>
          )}
        </Notice>
      )}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" error={state?.errors?.email}>
        <Input name="email" type="email" autoComplete="username" required autoFocus defaultValue={state?.email} key={state?.email} />
      </Field>
      <Field label="Password" error={state?.errors?.password}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button variant="primary" disabled={pending} className="mt-2 min-h-12">
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <Link href="/forgot-password" className="text-center text-sm text-muted underline">
        Forgot your password?
      </Link>
    </form>
  );
}
