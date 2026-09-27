"use client";

import { useActionState } from "react";
import { assignAction, progressAction } from "../fitness-actions";
import { Button, Field, Input, Notice, Select } from "@/components/ui";

export function AssignForm({ memberId, workouts, diets, workoutId, dietId }: { memberId: string; workouts: { id: string; name: string }[]; diets: { id: string; name: string }[]; workoutId: string | null; dietId: string | null }) {
  const [state, action, pending] = useActionState(assignAction.bind(null, memberId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.message && <Notice tone={state.ok ? "ok" : "alert"}>{state.message}</Notice>}
      <Field label="Workout">
        <Select name="workoutPlanId" defaultValue={workoutId ?? ""}>
          <option value="">None</option>
          {workouts.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Diet">
        <Select name="dietPlanId" defaultValue={dietId ?? ""}>
          <option value="">None</option>
          {diets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <Button disabled={pending}>Save plans</Button>
      </div>
    </form>
  );
}

export function ProgressForm({ memberId, today }: { memberId: string; today: string }) {
  const [state, action, pending] = useActionState(progressAction.bind(null, memberId), undefined);
  const e = state?.errors ?? {};
  const sent = state?.ok ? undefined : (state?.values as Record<string, string> | undefined);
  return (
    <form action={action} key={state?.nonce} className="flex flex-col gap-3">
      {state?.message && <Notice tone={state.ok ? "ok" : "alert"}>{state.message}</Notice>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Date" error={e.date}>
          <Input name="date" type="date" max={today} defaultValue={sent?.date ?? today} required />
        </Field>
        <Field label="Weight (kg)" error={e.weightKg}>
          <Input name="weightKg" inputMode="decimal" defaultValue={sent?.weightKg} />
        </Field>
        <Field label="Body fat %" error={e.bodyFat}>
          <Input name="bodyFat" inputMode="decimal" defaultValue={sent?.bodyFat} />
        </Field>
        <Field label="Waist (cm)" error={e.waistCm}>
          <Input name="waistCm" inputMode="decimal" defaultValue={sent?.waistCm} />
        </Field>
      </div>
      <Field label="Notes" error={e.notes}>
        <Input name="notes" defaultValue={sent?.notes} />
      </Field>
      <div>
        <Button disabled={pending}>Add measurement</Button>
      </div>
    </form>
  );
}
