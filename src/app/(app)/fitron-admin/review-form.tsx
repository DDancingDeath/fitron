"use client";

import { useActionState } from "react";
import { Button, Input } from "@/components/ui";
import { reviewAction } from "./actions";

export function ReviewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(reviewAction, null);
  if (state?.done) return <p className="text-sm text-ok">{state.done}</p>;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" name="decision" value="CONFIRM" disabled={pending}>
          Money received
        </Button>
        <Input name="reason" placeholder="Why it doesn't match (to reject)" aria-label="Reason for rejecting" className="w-64" maxLength={200} />
        <Button name="decision" value="REJECT" disabled={pending}>
          Reject
        </Button>
      </div>
      {state?.error && <p className="text-sm text-alert">{state.error}</p>}
    </form>
  );
}
