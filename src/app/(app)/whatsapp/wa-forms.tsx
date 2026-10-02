"use client";

import { useActionState, useState } from "react";
import { LightningIcon } from "@phosphor-icons/react";
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

export function SendOneForm({ memberId, templates, invoices, invoiceId }: { memberId: string; templates: { key: string; name: string; body: string }[]; invoices: { id: string; number: string }[]; invoiceId?: string }) {
  const [state, action, pending] = useActionState(sendOneAction.bind(null, memberId), undefined);
  // Opened from "Send invoice on WhatsApp": the invoice template with that invoice attached.
  const preset = invoiceId && invoices.some((i) => i.id === invoiceId) && templates.some((t) => t.key === "invoice") ? invoiceId : undefined;
  const [key, setKey] = useState(preset ? "invoice" : "campaign");
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
          <Select name="invoiceId" defaultValue={preset ?? invoices[0]!.id}>
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

type Card = { key: string; name: string; trigger: string; body: string; autoSend: boolean; metaTemplateName: string | null; language: string; rule: string; due?: string; sent: number };

/** A template card as in the prototype: trigger, Auto-send, the message, its rule and today's matches; Edit opens the text in place. */
export function TemplateCard({ t, vars, canEdit, cloud, toggle }: { t: Card; vars: string[]; canEdit: boolean; cloud: boolean; toggle: (on: boolean) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(t.body);
  const [saved, setSaved] = useState(t.body);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface px-[22px] py-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] tracking-[0.1em] text-muted uppercase">{t.trigger}</div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            defaultChecked={t.autoSend}
            disabled={!canEdit || busy}
            onChange={async (e) => {
              setBusy(true);
              await toggle(e.currentTarget.checked);
              setBusy(false);
            }}
            className="accent-[var(--accent)]"
          />
          Auto-send
        </label>
      </div>
      <div className="text-[17px] font-semibold">{t.name}</div>
      {editing ? (
        <form
          action={async (fd) => {
            setPending(true);
            const r = await saveTemplateAction(t.key, undefined, fd);
            setPending(false);
            if (r?.ok) {
              setSaved(body);
              setEditing(false);
              setError("");
            } else setError(r?.errors?.body?.[0] ?? r?.message ?? "Couldn't save.");
          }}
          className="flex flex-col gap-2"
        >
          {error && <Notice tone="alert">{error}</Notice>}
          <Textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[170px] text-[13px]" required />
          <div className="flex flex-wrap gap-1">
            {vars.map((v) => (
              <button key={v} type="button" onClick={() => setBody((b) => `${b}{{${v}}}`)} className="rounded-sm bg-neutral-200 px-2 py-[3px] text-[11px] text-neutral-800">
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          {cloud ? (
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Input name="metaTemplateName" defaultValue={t.metaTemplateName ?? ""} placeholder="Approved Meta template name" aria-label="Meta template name" />
              <Input name="language" defaultValue={t.language} aria-label="Language" />
            </div>
          ) : (
            <>
              <input type="hidden" name="metaTemplateName" value={t.metaTemplateName ?? ""} />
              <input type="hidden" name="language" value={t.language} />
            </>
          )}
          {t.autoSend && <input type="hidden" name="autoSend" value="on" />}
          <div className="flex gap-2">
            <Button variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save template"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => (setEditing(false), setBody(saved), setError(""))}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="max-h-[170px] overflow-auto rounded-md bg-bg px-3 py-2.5 text-[13px] whitespace-pre-wrap">{saved}</div>
          <div className="flex items-start gap-2 text-[13px]">
            <LightningIcon size={16} weight="duotone" className="mt-0.5 flex-none text-accent" />
            <span>
              {t.rule}
              {t.due && <span className="mt-0.5 block text-xs text-accent">{t.due}</span>}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-line-soft pt-2.5 text-[13px] text-muted">
            <span>
              {t.autoSend ? "Auto-send on" : "Auto-send off"} · {t.sent} sent
            </span>
            {canEdit && (
              <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
