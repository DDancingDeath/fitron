"use client";

import { useActionState, useState } from "react";
import { campaignAction, saveTemplateAction, sendOneAction } from "./actions";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";

export function TemplateForm({ tkey, body, metaTemplateName, language, autoSend }: { tkey: string; body: string; metaTemplateName: string | null; language: string; autoSend: boolean }) {
  const [state, action, pending] = useActionState(saveTemplateAction.bind(null, tkey), undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.message && <Notice tone={state.ok ? "ok" : "alert"}>{state.message}</Notice>}
      <Field label="Message" error={e.body}>
        <Textarea name="body" rows={5} defaultValue={body} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <Field label="Approved Meta template name (Cloud API)" error={e.metaTemplateName} hint="Must match this text with {{1}}, {{2}}… in the same order.">
          <Input name="metaTemplateName" defaultValue={metaTemplateName ?? ""} placeholder="e.g. expiry_reminder_7" />
        </Field>
        <Field label="Language" error={e.language}>
          <Input name="language" defaultValue={language} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="autoSend" defaultChecked={autoSend} className="size-4" /> Send automatically
        </label>
      </div>
      <div>
        <Button disabled={pending}>Save</Button>
      </div>
    </form>
  );
}

export function SendOneForm({ memberId, templates, invoices }: { memberId: string; templates: { key: string; name: string; body: string }[]; invoices: { id: string; number: string }[] }) {
  const [state, action, pending] = useActionState(sendOneAction.bind(null, memberId), undefined);
  const [key, setKey] = useState("campaign");
  const t = templates.find((x) => x.key === key);
  return (
    <form action={action} key={state?.nonce} className="flex flex-col gap-3">
      {state?.message && <Notice tone={state.ok ? "ok" : "alert"}>{state.message}</Notice>}
      <Field label="Template">
        <Select name="key" value={key} onChange={(e) => setKey(e.target.value)}>
          {templates.map((x) => (
            <option key={x.key} value={x.key}>
              {x.name}
            </option>
          ))}
        </Select>
      </Field>
      {key === "campaign" ? (
        <Field label="Message">
          <Textarea name="body" rows={4} defaultValue={t?.body} required />
        </Field>
      ) : (
        <p className="whitespace-pre-line rounded-lg border border-line bg-surface-2 p-3 text-sm text-muted">{t?.body}</p>
      )}
      {(key === "invoice" || key === "renewal") && invoices.length > 0 && (
        <Field label="Attach invoice">
          <Select name="invoiceId" defaultValue={invoices[0]!.id}>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div>
        <Button variant="primary" disabled={pending}>
          {pending ? "Sending…" : "Send on WhatsApp"}
        </Button>
      </div>
    </form>
  );
}

export function CampaignForm({ audiences }: { audiences: { key: string; label: string; count: number }[] }) {
  const [state, action, pending] = useActionState(campaignAction, undefined);
  const [aud, setAud] = useState(audiences[0]?.key ?? "active");
  const n = audiences.find((a) => a.key === aud)?.count ?? 0;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Send this message to ${n} member${n === 1 ? "" : "s"}?`)) e.preventDefault();
      }}
      className="flex flex-col gap-3"
    >
      {state?.message && <Notice tone={state.ok ? "ok" : "alert"}>{state.message}</Notice>}
      <Field label="Send to">
        <Select name="audience" value={aud} onChange={(e) => setAud(e.target.value)}>
          {audiences.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label} ({a.count})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Message" hint="{{member_name}}, {{expiry_date}}, {{pending_amount}} and {{gym_name}} are filled in for each member.">
        <Textarea name="body" rows={5} defaultValue={"Hi {{member_name}}, "} required />
      </Field>
      <div>
        <Button variant="primary" disabled={pending || n === 0 || n > 250}>
          {pending ? "Sending…" : `Send to ${n}`}
        </Button>
        {n > 250 && <p className="mt-2 text-sm text-alert">WhatsApp limits bulk sending. Pick a smaller group (250 or fewer).</p>}
      </div>
    </form>
  );
}
