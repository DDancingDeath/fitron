import Link from "next/link";
import { LightningIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react/dist/ssr";
import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { getWaSettings, listMessages, listTemplates } from "@/lib/services/whatsapp";
import { automationPreview, lastAutomationRun, ruleText } from "@/lib/services/wa-automation";
import { VARS } from "@/lib/domain/whatsapp";
import { todayIso } from "@/lib/services/time";
import { Tag } from "@/components/tag";
import { LinkButton, ListHeader, Notice, Pager, TABLE, TD, TH, cx } from "@/components/ui";
import { fmtShort, fmtTime } from "@/lib/format";
import { TemplateCard } from "./wa-forms";
import { refreshAction, retryMessageAction, runAutomationAction, toggleAutoSendAction } from "./actions";

export const metadata = { title: "WhatsApp · Fitron" };

const MODE = { demo: "Simulated", cloud: "Cloud API · automatic", connector: "Linked · automatic" } as const;
const PROVIDER = { demo: "Demo mode · messages are logged, not sent", cloud: "WhatsApp Cloud API", connector: "Linked gym phone" } as const;
const FILTERS = ["All", "Read", "Delivered", "Sent", "Failed"] as const;

export default async function WhatsAppPage({ searchParams }: PageProps<"/whatsapp">) {
  const u = await requirePermission("whatsapp.send");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const tab = s("tab") === "log" ? "log" : "templates";
  const canSettings = u.can("settings.manage");
  const today = todayIso();
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00+05:30`);
  const scope = { orgId: u.orgId, OR: [{ memberId: null }, { member: { branchId: { in: u.branchIds } } }] };
  const [settings, templates, month] = await Promise.all([
    getWaSettings(u.orgId),
    listTemplates(u.orgId),
    db.whatsAppMessage.groupBy({ by: ["status"], where: { ...scope, sentAt: { gte: monthStart } }, _count: { _all: true } }),
  ]);
  const n = (st: string[]) => month.filter((m) => st.includes(m.status)).reduce((a, m) => a + m._count._all, 0);
  const total = month.reduce((a, m) => a + m._count._all, 0);
  const stats: [string, string, boolean?][] = [
    ["Sent this month", String(total)],
    ["Mode", MODE[settings.mode]],
    ...(settings.mode === "demo"
      ? []
      : ([
          ["Delivered", total ? `${Math.round((n(["Delivered", "Read"]) / total) * 100)}%` : "—"],
          ["Read", total ? `${Math.round((n(["Read"]) / total) * 100)}%` : "—"],
        ] as [string, string][])),
    ["Failed", String(n(["Failed"])), true],
  ];

  return (
    <div className="flex flex-col gap-6">
      <ListHeader
        kicker={PROVIDER[settings.mode]}
        title="WhatsApp"
        actions={
          <>
            {settings.mode === "connector" && (
              <form action={refreshAction}>
                <button className="inline-flex min-h-[38px] items-center rounded-md border border-line px-[18px] text-sm font-semibold hover:bg-fg/7">Refresh statuses</button>
              </form>
            )}
            <LinkButton href="/whatsapp/send" variant="primary">
              <PaperPlaneTiltIcon size={17} weight="duotone" />
              New campaign
            </LinkButton>
          </>
        }
      />
      <div className="flex flex-wrap gap-10">
        {stats.map(([k, v, bad]) => (
          <div key={k}>
            <div className="text-[11px] tracking-[0.08em] text-muted uppercase">{k}</div>
            <div className={cx("text-[26px] font-semibold", bad && v !== "0" && "text-alert-700")}>{v}</div>
          </div>
        ))}
      </div>
      <nav className="flex flex-wrap gap-1">
        {[
          ["templates", "Templates & automation", "/whatsapp"],
          ["log", "Message log", "/whatsapp?tab=log"],
        ].map(([k, label, href]) => (
          <Link key={k} href={href!} className={cx("border-b-2 px-3 py-2 text-[15px]", k === tab ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg")}>
            {label}
          </Link>
        ))}
      </nav>
      {s("msg") && <Notice tone="ok">{s("msg")}</Notice>}
      {tab === "templates" ? <Templates u={u} templates={templates} settings={settings} canSettings={canSettings} /> : <Log u={u} s={s} />}
    </div>
  );
}

async function Templates({ u, templates, settings, canSettings }: { u: Awaited<ReturnType<typeof requirePermission>>; templates: Awaited<ReturnType<typeof listTemplates>>; settings: Awaited<ReturnType<typeof getWaSettings>>; canSettings: boolean }) {
  const [rows, last, sent] = await Promise.all([
    automationPreview(u),
    lastAutomationRun(u.orgId),
    db.whatsAppMessage.groupBy({ by: ["templateKey"], where: { orgId: u.orgId, OR: [{ memberId: null }, { member: { branchId: { in: u.branchIds } } }] }, _count: { _all: true } }),
  ]);
  const name = new Map(templates.map((t) => [t.key, t.name]));
  const due = rows.reduce((a, r) => a + r.send, 0);
  const counts = new Map(sent.map((x) => [x.templateKey, x._count._all]));
  const match = new Map(rows.map((r) => [r.key, `${r.send} due today${r.skipped ? ` · ${r.skipped} skipped` : ""}`]));
  return (
    <>
      <section className="flex flex-col gap-2.5 rounded-lg bg-surface px-5 py-[18px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px]">Today&apos;s automation</h3>
            <div className="text-xs text-muted">
              {last.at ? `Last run ${fmtShort(last.at)}, ${fmtTime(last.at)}` : "Not run today"} · the daily job sends these each morning
            </div>
          </div>
          {canSettings && (
            <form action={runAutomationAction}>
              <button disabled={!due} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-accent px-[18px] text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-45">
                <LightningIcon size={16} weight="duotone" />
                Send {due} due now
              </button>
            </form>
          )}
        </div>
        {rows.map((r) => (
          <div key={r.key} className="flex justify-between gap-3 border-b border-line py-1.5 text-sm">
            <span>
              {name.get(r.key) ?? r.key} <span className="text-xs text-muted">· {ruleText(r.key, "", settings).split(" · ")[0]}</span>
            </span>
            <span>
              <strong>{r.send}</strong> to send<span className="text-muted"> · {r.skipped} skipped</span>
            </span>
          </div>
        ))}
        {!rows.length && <div className="text-sm text-muted">Nothing due today from scheduled rules.</div>}
        {last.runs.slice(0, 6).map((x) => (
          <div key={x.ts} className="text-xs text-muted">
            {fmtShort(new Date(x.ts))}, {fmtTime(new Date(x.ts))} · sent by hand · {x.sent} sent
          </div>
        ))}
      </section>
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr))]">
        {templates.map((t) => (
          <TemplateCard
            key={t.key}
            t={{ key: t.key, name: t.name, trigger: t.trigger, body: t.body, autoSend: t.autoSend, metaTemplateName: t.metaTemplateName, language: t.language, rule: ruleText(t.key, t.trigger, settings), due: match.get(t.key), sent: counts.get(t.key) ?? 0 }}
            vars={[...VARS]}
            canEdit={canSettings}
            cloud={settings.mode === "cloud"}
            toggle={toggleAutoSendAction.bind(null, t.key)}
          />
        ))}
      </div>
    </>
  );
}

async function Log({ u, s }: { u: Awaited<ReturnType<typeof requirePermission>>; s: (k: string) => string | undefined }) {
  const f = (FILTERS as readonly string[]).includes(s("status") ?? "") ? s("status")! : "All";
  const page = Math.max(1, Number(s("page") ?? 1) || 1);
  const [list, templates] = await Promise.all([listMessages(u, { status: f === "All" ? undefined : f, page, pageSize: 20 }), listTemplates(u.orgId)]);
  const name = new Map(templates.map((t) => [t.key, t.name]));
  const href = (st: string, p = 1) => `/whatsapp?tab=log${st !== "All" ? `&status=${st}` : ""}${p > 1 ? `&page=${p}` : ""}`;
  return (
    <>
      <div className="inline-flex flex-wrap self-start overflow-hidden rounded-md border border-line">
        {FILTERS.map((k) => (
          <Link key={k} href={href(k)} className={cx("px-3 py-[7px] text-[13px]", k === f ? "bg-accent text-accent-ink" : "hover:bg-fg/7")}>
            {k}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr>
              {["Sent", "Member", "To", "Message", "Status", ""].map((h, i) => (
                <th key={i} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.rows.map((m) => (
              <tr key={m.id} className="hover:bg-fg/4">
                <td className={cx(TD, "whitespace-nowrap")}>
                  {fmtShort(m.sentAt)}, {fmtTime(m.sentAt)}
                </td>
                <td className={TD}>{m.member ? <Link href={`/members/${m.member.id}`} className="hover:text-accent">{m.member.name}</Link> : "—"}</td>
                <td className={cx(TD, "whitespace-nowrap")}>{m.toNumber}</td>
                <td className={cx(TD, "max-w-[360px] text-[13px]")}>
                  {name.get(m.templateKey) ?? m.templateKey}
                  {m.attachment ? " · invoice PDF" : ""}
                  <div className="max-w-[360px] truncate text-muted">{m.body.replace(/\n+/g, " ")}</div>
                  {m.error && <div className="text-alert-700">{m.error}</div>}
                </td>
                <td className={TD}>
                  <Tag label={m.status}>{m.status === "Logged" ? "Logged (demo)" : m.status}</Tag>
                </td>
                <td className={TD}>
                  {m.status === "Failed" && m.memberId && (
                    <form action={retryMessageAction.bind(null, m.id)}>
                      <button className="inline-flex min-h-[34px] items-center rounded-md px-1.5 text-sm font-semibold text-accent hover:bg-accent/10">Retry</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.rows.length && <div className="text-sm text-muted">No messages yet. Reminders, receipts and renewal messages appear here as they go out.</div>}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => href(f, p)} />
    </>
  );
}
