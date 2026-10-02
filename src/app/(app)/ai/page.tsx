import Link from "next/link";
import { ArrowRightIcon, BellRingingIcon, ChartLineDownIcon, InfoIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { requirePermission } from "@/lib/auth/current";
import { aiReady } from "@/lib/integrations/anthropic";
import { atRisk, dailyBrief } from "@/lib/services/insights";
import { todayIso } from "@/lib/services/time";
import { Button } from "@/components/ui";
import { Tag } from "@/components/tag";
import { riskBand } from "@/lib/domain/risk";
import { canOpen } from "@/lib/nav";
import { AiChat } from "./chat";
import { refreshRiskAction } from "./actions";

export const metadata = { title: "Fitron AI · Fitron" };

const ICON = { alert: WarningCircleIcon, accent: BellRingingIcon, neutral: InfoIcon, ok: InfoIcon } as const;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function AiPage() {
  const u = await requirePermission("ai.use");
  const [brief, risky] = await Promise.all([dailyBrief(u), u.can("members.view") ? atRisk(u, 12) : Promise.resolve([])]);
  const d = new Date(`${todayIso()}T00:00:00Z`);
  const today = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return (
    <div className="flex flex-col gap-6 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fitron-mark.png" alt="" className="size-[60px] flex-none rounded-full shadow-[0_0_0_1px_var(--color-accent),0_8px_28px_rgba(207,169,79,0.22)]" />
          <div>
            <div className="text-xs tracking-[0.04em] text-muted uppercase">Your operations assistant</div>
            <h1 className="mt-1 text-[28px] lg:text-[40px]">Fitron AI</h1>
          </div>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-[13px] text-muted">
          <span className="size-2 rounded-full bg-[#4ade80] shadow-[0_0_6px_#4ade80]" />
          Reads live gym data · actions need your OK
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] items-start gap-5">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-1 rounded-lg bg-surface p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[17px]">Today’s brief</h3>
              <span className="text-xs text-muted">{today}</span>
            </div>
            {brief.length === 0 && <p className="border-t border-line py-3 text-sm text-muted">Nothing needs attention right now.</p>}
            {brief.map((a, i) => {
              const Icon = ICON[a.tone] ?? ChartLineDownIcon;
              return (
                <div key={i} className="flex items-start gap-3 border-t border-line py-3">
                  <span className="grid size-9 flex-none place-items-center rounded-[10px] bg-accent-soft">
                    <Icon size={18} weight="duotone" className={a.tone === "alert" ? "text-alert-700" : "text-accent"} />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <div className="text-sm font-semibold">{a.title}</div>
                    <div className="text-[13px] leading-relaxed text-fg/85">{a.detail}</div>
                    {a.href && canOpen(u, a.href) && (
                      <Link href={a.href} className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 self-start rounded-md border border-line px-3 text-[13px] font-semibold hover:bg-fg/7">
                        Open
                        <ArrowRightIcon size={14} weight="duotone" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
          {u.can("members.view") && (
            <section className="flex flex-col gap-1 rounded-lg bg-surface p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[17px]">Members at risk</h3>
                <form action={refreshRiskAction}>
                  <Button variant="ghost" className="min-h-8 text-[13px]">
                    Refresh scores
                  </Button>
                </form>
              </div>
              {risky.length === 0 && <p className="border-t border-line py-3 text-sm text-muted">No one at risk. Scores update every night.</p>}
              {risky.map((m) => (
                <Link key={m.id} href={`/members/${m.id}`} className="flex items-start justify-between gap-3 border-t border-line py-2.5 hover:text-accent">
                  <span>
                    <span className="block text-sm font-semibold">{m.name}</span>
                    <span className="block text-xs text-muted">{m.riskReasons.slice(0, 2).join(" · ")}</span>
                  </span>
                  <Tag label={`${riskBand(m.riskScore ?? 0)} risk`} />
                </Link>
              ))}
            </section>
          )}
        </div>
        <section className="flex min-h-[560px] flex-col overflow-hidden rounded-lg bg-surface">
          <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/fitron-mark.png" alt="" className="size-[30px] rounded-full" />
            <div>
              <div className="text-sm font-semibold">Chat with Fitron AI</div>
              <div className="text-xs text-muted">Ask about members, money, renewals or staff</div>
            </div>
          </div>
          <AiChat ready={aiReady()} />
        </section>
      </div>
    </div>
  );
}
