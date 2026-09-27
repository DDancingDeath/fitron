import { requirePermission } from "@/lib/auth/current";
import { AUDIENCES, audienceCounts, type Audience } from "@/lib/services/audience";
import { getWaSettings } from "@/lib/services/whatsapp";
import { Card, Notice, PageHeader } from "@/components/ui";
import { CampaignForm } from "../wa-forms";

export const metadata = { title: "Message a group · Fitron" };

export default async function SendPage() {
  const u = await requirePermission("whatsapp.send");
  const [counts, s] = await Promise.all([audienceCounts(u), getWaSettings(u.orgId)]);
  return (
    <>
      <PageHeader title="Message a group" subtitle="One message to many members. Each gets their own name and dates." />
      {s.mode === "demo" && (
        <div className="mb-4">
          <Notice>Demo mode: messages are logged, not sent.</Notice>
        </div>
      )}
      {s.mode === "connector" && (
        <div className="mb-4">
          <Notice tone="alert">The linked phone sends one message every 8–15 seconds, up to 250 a day. Message only members who expect to hear from you, or WhatsApp may restrict the number.</Notice>
        </div>
      )}
      <Card>
        <CampaignForm audiences={(Object.keys(AUDIENCES) as Audience[]).map((k) => ({ key: k, label: AUDIENCES[k], count: counts[k] }))} />
      </Card>
    </>
  );
}
