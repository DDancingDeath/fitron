import Link from "next/link";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { requirePermission } from "@/lib/auth/current";
import { getWaSettings, listMessages, listTemplates } from "@/lib/services/whatsapp";
import { AutoFilter } from "@/components/auto-filter";
import { Button, LinkButton, Notice, SEARCH, Segmented, Select, TABLE, TD, TH, TR, cx } from "@/components/ui";
import { Tag } from "@/components/tag";
import { fmtStamp, fmtTime } from "@/lib/format";
import { refreshAction } from "./actions";
import { WaHeader } from "./wa-header";

export const metadata = { title: "WhatsApp · Fitron" };

const STATUSES = ["Sent", "Delivered", "Read", "Queued", "Logged", "Failed"];

export default async function WhatsAppPage({ searchParams }: PageProps<"/whatsapp">) {
  const u = await requirePermission("whatsapp.send");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const [settings, templates, list] = await Promise.all([getWaSettings(u.orgId), listTemplates(u.orgId), listMessages(u, { status: s("status"), key: s("key"), q: s("q"), page: Number(s("page") ?? 1) })]);
  const names = new Map(templates.map((t) => [t.key, t.name]));
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const link = (p: Record<string, string | undefined>) => {
    const all = { status: s("status"), key: s("key"), q: s("q"), ...p };
    const qs = new URLSearchParams(Object.entries(all).filter(([, v]) => v) as [string, string][]).toString();
    return `/whatsapp${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6 pt-4">
      <WaHeader u={u} current="/whatsapp" />
      {settings.mode === "demo" && (
        <Notice>
          Demo mode: messages are logged here and not sent.{" "}
          {u.can("settings.manage") && (
            <Link href="/settings#whatsapp" className="underline">
              Connect WhatsApp in Settings
            </Link>
          )}
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented
          options={[{ key: "", label: "All", href: link({ status: undefined, page: undefined }) }, ...STATUSES.map((st) => ({ key: st, label: `${st === "Logged" ? "Logged (demo)" : st}${list.counts[st] ? ` · ${list.counts[st]}` : ""}`, href: link({ status: st, page: undefined }) }))]}
          current={s("status") ?? ""}
        />
        {settings.mode === "connector" && (
          <form action={refreshAction}>
            <Button variant="ghost">
              <ArrowsClockwiseIcon size={16} weight="duotone" />
              Refresh statuses
            </Button>
          </form>
        )}
      </div>
      <AutoFilter className="flex flex-wrap gap-2.5">
        {s("status") && <input type="hidden" name="status" value={s("status")} />}
        <input type="text" name="q" defaultValue={s("q")} placeholder="Member name or number" aria-label="Search" className={SEARCH} />
        <Select name="key" defaultValue={s("key") ?? ""} aria-label="Template" className="w-auto!">
          <option value="">Any template</option>
          {templates.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </Select>
      </AutoFilter>
      {list.rows.length === 0 ? (
        <p className="text-sm text-muted">No messages yet. Reminders, receipts and renewal messages appear here as they go out.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={cx(TABLE, "min-w-[860px]")}>
            <thead>
              <tr>
                {["Sent", "Member", "To", "Message", "Status"].map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.rows.map((m) => (
                <tr key={m.id} className={TR}>
                  <td className={cx(TD, "whitespace-nowrap")}>
                    {fmtStamp(m.sentAt)}, {fmtTime(m.sentAt)}
                  </td>
                  <td className={TD}>
                    {m.member ? (
                      <Link href={`/members/${m.member.id}?tab=whatsapp`} className="hover:text-accent">
                        {m.member.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={cx(TD, "whitespace-nowrap")}>{m.toNumber}</td>
                  <td className={cx(TD, "max-w-[360px] text-[13px]")}>
                    {names.get(m.templateKey) ?? m.templateKey}
                    {m.attachment ? " · PDF" : ""}
                    <div className="max-w-[360px] truncate text-muted">{m.body}</div>
                    {m.error && <div className="text-alert-700">{m.error}</div>}
                  </td>
                  <td className={TD}>
                    <Tag label={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted">
          Page {list.page} of {pages} · {list.total.toLocaleString("en-IN")} messages
        </span>
        <div className="flex gap-2">
          {list.page > 1 ? <LinkButton href={link({ page: String(list.page - 1) })}>Previous</LinkButton> : <Button disabled>Previous</Button>}
          {list.page < pages ? <LinkButton href={link({ page: String(list.page + 1) })}>Next</LinkButton> : <Button disabled>Next</Button>}
        </div>
      </div>
    </div>
  );
}
