"use client";

import { useActionState } from "react";
import { Button, Input } from "@/components/ui";
import { reviewAction, reviewTrainerAction } from "./actions";

/** `trainer`: an AI Trainer member's payment rather than a gym's. */
export function ReviewForm({ id, trainer = false }: { id: string; trainer?: boolean }) {
  const [state, action, pending] = useActionState(trainer ? reviewTrainerAction : reviewAction, null);
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
