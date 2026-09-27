import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { getWaSettings, listMessages, listTemplates } from "@/lib/services/whatsapp";
import { Badge, Button, Empty, Input, LinkButton, Notice, PageHeader, Select, cx } from "@/components/ui";
import { fmtStamp, fmtTime } from "@/lib/format";
import { refreshAction } from "./actions";

export const metadata = { title: "WhatsApp · Fitron" };

const TONE = { Logged: "neutral", Queued: "neutral", Sent: "accent", Delivered: "ok", Read: "ok", Failed: "alert" } as const;
const MODE = { demo: "Demo mode: messages are logged here and not sent.", cloud: "Sending through the WhatsApp Cloud API.", connector: "Sending through the linked gym phone." };

export default async function WhatsAppPage({ searchParams }: PageProps<"/whatsapp">) {
  const u = await requirePermission("whatsapp.send");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [settings, templates, list] = await Promise.all([getWaSettings(u.orgId), listTemplates(u.orgId), listMessages(u, { status: s("status"), key: s("key"), q: s("q"), page: Number(s("page") ?? 1) })]);
  const names = new Map(templates.map((t) => [t.key, t.name]));
  const pages = Math.ceil(list.total / list.pageSize);
  const statuses = ["Sent", "Delivered", "Read", "Queued", "Logged", "Failed"];

  return (
    <>
      <PageHeader
        title="WhatsApp"
        subtitle={`${list.total} messages${s("status") ? ` ${s("status")!.toLowerCase()}` : ""}`}
        actions={
          <>
            {settings.mode === "connector" && (
              <form action={refreshAction}>
                <Button>Refresh statuses</Button>
              </form>
            )}
            {u.can("settings.manage") && <LinkButton href="/whatsapp/templates">Templates</LinkButton>}
            <LinkButton href="/whatsapp/send" variant="primary">
              Message a group
            </LinkButton>
          </>
        }
      />
      <div className="mb-4">
        <Notice tone={settings.mode === "demo" ? "accent" : "ok"}>
          {MODE[settings.mode]}
          {u.can("settings.manage") && (
            <>
              {" "}
              <Link href="/settings#whatsapp" className="underline">
                Change in Settings
              </Link>
            </>
          )}
        </Notice>
      </div>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/whatsapp" className={cx("rounded-full border px-3 py-1.5", !s("status") ? "border-accent bg-accent-soft text-accent" : "border-line")}>
          All
        </Link>
        {statuses.map((st) => (
          <Link key={st} href={`/whatsapp?status=${st}`} className={cx("rounded-full border px-3 py-1.5", s("status") === st ? "border-accent bg-accent-soft text-accent" : "border-line")}>
            {st} {list.counts[st] ? `(${list.counts[st]})` : ""}
          </Link>
        ))}
      </div>
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        {s("status") && <input type="hidden" name="status" value={s("status")} />}
        <Input name="q" defaultValue={s("q")} placeholder="Member name or number" aria-label="Search" />
        <Select name="key" defaultValue={s("key") ?? ""} aria-label="Template">
          <option value="">Any template</option>
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </Select>
        <Button>Filter</Button>
      </form>
      {list.rows.length === 0 ? (
        <Empty>No messages yet. Reminders, receipts and renewal messages appear here as they go out.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {list.rows.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1">
                    {m.member ? (
                      <Link href={`/members/${m.member.id}`} className="font-semibold hover:text-accent">
                        {m.member.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{m.toNumber}</span>
                    )}
                    <span className="text-sm text-muted">
                      {" "}
                      · {names.get(m.templateKey) ?? m.templateKey} · {fmtStamp(m.sentAt)} {fmtTime(m.sentAt)}
                      {m.attachment ? " · PDF" : ""}
                    </span>
                  </span>
                  <Badge tone={TONE[m.status as keyof typeof TONE] ?? "neutral"}>{m.status === "Logged" ? "Logged (demo)" : m.status}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted">{m.body}</p>
                {m.error && <p className="mt-1 text-sm text-alert">{m.error}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {list.page > 1 && <LinkButton href={`/whatsapp?${new URLSearchParams({ ...(sp as Record<string, string>), page: String(list.page - 1) })}`}>← Newer</LinkButton>}
          {list.page < pages && <LinkButton href={`/whatsapp?${new URLSearchParams({ ...(sp as Record<string, string>), page: String(list.page + 1) })}`}>Older →</LinkButton>}
        </div>
      )}
    </>
  );
}
