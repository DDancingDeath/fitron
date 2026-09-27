import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { aiReady } from "@/lib/integrations/anthropic";
import { atRisk, dailyBrief } from "@/lib/services/insights";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { riskBand } from "@/lib/domain/risk";
import { AiChat } from "./chat";
import { refreshRiskAction } from "./actions";

export const metadata = { title: "Fitron AI · Fitron" };

export default async function AiPage() {
  const u = await requirePermission("ai.use");
  const [brief, risky] = await Promise.all([dailyBrief(u), u.can("members.view") ? atRisk(u, 12) : Promise.resolve([])]);
  return (
    <>
      <PageHeader title="Fitron AI" subtitle="Today's brief, members at risk, and an assistant that knows your gym." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Ask" className="lg:col-span-3">
          <AiChat ready={aiReady()} />
        </Card>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card title="Today's brief">
            {brief.length === 0 ? (
              <p className="text-sm text-muted">Nothing needs attention right now.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {brief.map((a, i) => (
                  <li key={i} className="py-2">
                    <p className="font-semibold">
                      <Badge tone={a.tone}>{a.tone === "alert" ? "Act" : a.tone === "accent" ? "Watch" : "Note"}</Badge> {a.href ? <Link href={a.href} className="hover:text-accent">{a.title}</Link> : a.title}
                    </p>
                    <p className="text-muted">{a.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {u.can("members.view") && (
            <Card
              title="Members at risk"
              action={
                <form action={refreshRiskAction}>
                  <Button className="min-h-8 px-3 text-xs">Refresh</Button>
                </form>
              }
            >
              {risky.length === 0 ? (
                <p className="text-sm text-muted">No one at risk. Scores update every night.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {risky.map((m) => (
                    <li key={m.id} className="py-2">
                      <Link href={`/members/${m.id}`} className="flex items-center justify-between gap-2 font-semibold hover:text-accent">
                        <span>{m.name}</span>
                        <Badge tone={riskBand(m.riskScore ?? 0) === "High" ? "alert" : "accent"}>
                          {riskBand(m.riskScore ?? 0)} · {m.riskScore}
                        </Badge>
                      </Link>
                      <p className="text-muted">{m.riskReasons.join(" · ")}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
