"use client";

import { useActionState } from "react";
import { saveMember } from "./actions";
import { Button, Card, Field, Input, LinkButton, Notice, Select, Textarea } from "@/components/ui";
import { GENDERS, SOURCES } from "@/lib/validation/member";

type Values = Partial<Record<string, string | null>>;

export function MemberForm({ id, values = {}, trainers }: { id?: string; values?: Values; trainers: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveMember.bind(null, id ?? null), undefined);
  const e = state?.errors ?? {};
  const sent = state?.values;
  const v = (k: string) => (sent ? (sent[k] as string | undefined) : (values[k] ?? undefined));

  return (
    <form action={action} key={state?.nonce} className="flex flex-col gap-4">
      {state?.message && <Notice tone="alert">{state.message}</Notice>}
      <Card title="Personal">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={e.name}>
            <Input name="name" defaultValue={v("name")} required />
          </Field>
          <Field label="Gender" error={e.gender}>
            <Select name="gender" defaultValue={v("gender") ?? ""} required>
              <option value="" disabled>
                Choose
              </option>
              {GENDERS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
          </Field>
          <Field label="Mobile" error={e.phone}>
            <Input name="phone" type="tel" inputMode="numeric" defaultValue={v("phone")} required />
          </Field>
          <Field label="WhatsApp" error={e.whatsapp} hint="Leave empty if same as mobile">
            <Input name="whatsapp" type="tel" inputMode="numeric" defaultValue={v("whatsapp")} />
          </Field>
          <Field label="Email" error={e.email}>
            <Input name="email" type="email" defaultValue={v("email")} />
          </Field>
          <Field label="Date of birth" error={e.dob}>
            <Input name="dob" type="date" defaultValue={v("dob")} />
          </Field>
          <Field label="Occupation" error={e.occupation}>
            <Input name="occupation" defaultValue={v("occupation")} />
          </Field>
          <Field label="How did they hear about you?" error={e.source}>
            <Select name="source" defaultValue={v("source") ?? ""} required>
              <option value="" disabled>
                Choose
              </option>
              {SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>
      <Card title="Address">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="House / street" error={e.house}>
            <Input name="house" defaultValue={v("house")} />
          </Field>
          <Field label="Area" error={e.area}>
            <Input name="area" defaultValue={v("area")} />
          </Field>
          <Field label="City" error={e.city}>
            <Input name="city" defaultValue={v("city")} />
          </Field>
          <Field label="State" error={e.state}>
            <Input name="state" defaultValue={v("state")} />
          </Field>
          <Field label="PIN code" error={e.pin}>
            <Input name="pin" inputMode="numeric" defaultValue={v("pin")} />
          </Field>
        </div>
      </Card>
      <Card title="Emergency contact">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name" error={e.emergencyName}>
            <Input name="emergencyName" defaultValue={v("emergencyName")} />
          </Field>
          <Field label="Relation" error={e.emergencyRelation}>
            <Input name="emergencyRelation" defaultValue={v("emergencyRelation")} />
          </Field>
          <Field label="Phone" error={e.emergencyPhone}>
            <Input name="emergencyPhone" type="tel" inputMode="numeric" defaultValue={v("emergencyPhone")} />
          </Field>
        </div>
      </Card>
      <Card title="Gym">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Trainer" error={e.trainerId}>
            <Select name="trainerId" defaultValue={v("trainerId") ?? ""}>
              <option value="">No trainer</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tags" error={e.tags} hint="Separate with commas">
            <Input name="tags" defaultValue={v("tags")} />
          </Field>
          <Field label="Notes" error={e.notes} className="sm:col-span-2">
            <Textarea name="notes" defaultValue={v("notes")} />
          </Field>
          <Field label="Staff-only notes" error={e.staffNotes} className="sm:col-span-2">
            <Textarea name="staffNotes" defaultValue={v("staffNotes")} />
          </Field>
        </div>
      </Card>
      <div className="flex gap-2">
        <Button variant="primary" disabled={pending}>
          {pending ? "Saving…" : id ? "Save changes" : "Add member"}
        </Button>
        <LinkButton href={id ? `/members/${id}` : "/members"}>Cancel</LinkButton>
      </div>
    </form>
  );
}
