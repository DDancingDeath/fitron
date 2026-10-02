"use client";

import { useActionState, useRef, useState } from "react";
import { CircleNotchIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { Button, Notice } from "@/components/ui";
import { dismissProposalAction, sendProposalAction } from "./actions";

type Proposal = { id: string; summary: string; members: number; body: string };
type Turn = { role: "user" | "assistant"; content: string; steps?: string[]; proposals?: Proposal[]; error?: string };

const LABEL: Record<string, string> = {
  get_overview: "Looked at today's numbers",
  list_members: "Listed members",
  find_member: "Found the member",
  revenue_breakdown: "Read the accounts",
  class_and_attendance: "Checked attendance and classes",
  propose_action: "Drafted a message",
};

const SUGGESTIONS = ["How is this month going?", "Who should we call today?", "Which members owe the most?", "Remind members expiring this week to renew"];

function ProposalCard({ p }: { p: Proposal }) {
  const [sent, send, sending] = useActionState(sendProposalAction.bind(null, p.id), undefined);
  const [dropped, drop, dropping] = useActionState(dismissProposalAction.bind(null, p.id), undefined);
  const done = sent?.ok || dropped?.ok;
  return (
    <div className="mt-2 rounded-lg border border-accent/50 bg-accent-soft p-3 text-sm">
      <p className="font-semibold">
        {p.summary} · {p.members} member{p.members === 1 ? "" : "s"}
      </p>
      <p className="mt-1 whitespace-pre-line text-muted">{p.body}</p>
      {sent?.message && <p className={sent.ok ? "mt-2 text-ok" : "mt-2 text-alert"}>{sent.message}</p>}
      {dropped?.ok && <p className="mt-2 text-muted">Not sent.</p>}
      {!done && (
        <div className="mt-2 flex gap-2">
          <form action={send}>
            <Button variant="primary" disabled={sending || dropping}>
              {sending ? "Sending…" : "Send on WhatsApp"}
            </Button>
          </form>
          <form action={drop}>
            <Button disabled={sending || dropping}>Don&apos;t send</Button>
          </form>
        </div>
      )}
    </div>
  );
}

export function AiChat({ ready }: { ready: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    const history = [...turns.filter((t) => !t.error && t.content), { role: "user" as const, content: q.trim() }];
    setTurns([...turns, { role: "user", content: q.trim() }, { role: "assistant", content: "", steps: [], proposals: [] }]);
    setBusy(true);
    setStep("Thinking…");
    const patch = (f: (t: Turn) => Turn) => setTurns((ts) => [...ts.slice(0, -1), f(ts[ts.length - 1]!)]);
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        patch((t) => ({ ...t, error: j.error ?? "Something went wrong." }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === "text") patch((t) => ({ ...t, content: t.content ? `${t.content}\n\n${e.text}` : e.text }));
          if (e.type === "tool") {
            setStep(`${LABEL[e.name] ?? e.name}…`);
            patch((t) => ({ ...t, steps: [...(t.steps ?? []), LABEL[e.name] ?? e.name] }));
          }
          if (e.type === "proposal") patch((t) => ({ ...t, proposals: [...(t.proposals ?? []), e] }));
          if (e.type === "error") patch((t) => ({ ...t, error: e.message }));
        }
      }
    } catch {
      patch((t) => ({ ...t, error: "Couldn't reach Fitron AI. Check the connection and try again." }));
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  if (!ready)
    return (
      <div className="p-[18px]">
        <Notice>
          Fitron AI answers questions about your members, money and classes, and drafts WhatsApp messages for you to approve. To switch it on, the server needs an ANTHROPIC_API_KEY. The brief and risk list on this page work without it.
        </Notice>
      </div>
    );

  return (
    <>
      <div className="flex max-h-[520px] flex-1 flex-col gap-3 overflow-y-auto p-[18px]">
        {turns.length === 0 && <p className="self-start rounded-2xl bg-bg px-[15px] py-[11px] text-sm leading-relaxed">Hi! Ask me about members, money, renewals or classes. I only read what your role can see, and I never send anything without your OK.</p>}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <p key={i} className="max-w-[86%] self-end rounded-2xl bg-accent px-[15px] py-[11px] text-sm leading-relaxed whitespace-pre-wrap text-accent-ink">
              {t.content}
            </p>
          ) : (
            <div key={i} className="max-w-[86%] self-start rounded-2xl bg-bg px-[15px] py-[11px] text-sm leading-relaxed">
              {t.steps && t.steps.length > 0 && <p className="mb-1 text-xs text-muted">{t.steps.join(" · ")}</p>}
              {t.content && <div className="whitespace-pre-line">{t.content}</div>}
              {t.proposals?.map((p) => <ProposalCard key={p.id} p={p} />)}
              {t.error && <p className="text-alert">{t.error}</p>}
              {!t.content && !t.error && busy && i === turns.length - 1 && (
                <p className="flex items-center gap-2 text-[13px] text-muted">
                  <CircleNotchIcon size={16} weight="duotone" className="animate-spin text-accent" />
                  {step}
                </p>
              )}
            </div>
          ),
        )}
      </div>
      <div className="flex flex-col gap-2.5 border-t border-line px-[18px] pt-3 pb-4">
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} disabled={busy} className="flex-none rounded-full border border-line px-3 py-1.5 text-[13px] whitespace-nowrap hover:border-accent hover:text-accent">
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = input.current!.value;
            input.current!.value = "";
            void ask(q);
          }}
          className="flex items-center gap-2 rounded-[14px] border border-fg/30 bg-bg py-1.5 pr-1.5 pl-3.5"
        >
          <input
            ref={input}
            placeholder="Ask anything about your gym…"
            aria-label="Ask Fitron AI"
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[15px] text-fg outline-0 placeholder:text-fg/60"
            maxLength={4000}
          />
          <Button variant="primary" disabled={busy} aria-label="Send" className="rounded-[10px] px-3.5">
            <PaperPlaneTiltIcon size={18} weight="duotone" />
          </Button>
        </form>
      </div>
    </>
  );
}
