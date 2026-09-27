import { requirePermission } from "@/lib/auth/current";
import { getWaSettings, listTemplates } from "@/lib/services/whatsapp";
import { Card, Notice, PageHeader } from "@/components/ui";
import { VARS } from "@/lib/domain/whatsapp";
import { TemplateForm } from "../wa-forms";

export const metadata = { title: "WhatsApp templates · Fitron" };

export default async function TemplatesPage() {
  const u = await requirePermission("settings.manage");
  const [templates, s] = await Promise.all([listTemplates(u.orgId), getWaSettings(u.orgId)]);
  return (
    <>
      <PageHeader title="WhatsApp templates" subtitle={`Variables: ${VARS.map((v) => `{{${v}}}`).join(" ")}`} />
      {s.mode === "cloud" && (
        <div className="mb-4">
          <Notice>
            The Cloud API only delivers messages that start a conversation when they use a template Meta has approved. Create each template in Meta Business Manager with the same text, using {"{{1}}"}, {"{{2}}"}… for the variables in the order they appear here, then enter its name below.
          </Notice>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {templates.map((t) => (
          <Card key={t.key} title={t.name}>
            <p className="-mt-2 mb-3 text-sm text-muted">{t.trigger}</p>
            <TemplateForm tkey={t.key} body={t.body} metaTemplateName={t.metaTemplateName} language={t.language} autoSend={t.autoSend} />
          </Card>
        ))}
      </div>
    </>
  );
}
