import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { systemUser } from "@/lib/auth/system";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_TEMPLATES, placeholders, REMINDER_KEYS, render, rupeesText, waNumber, type TemplateVars } from "@/lib/domain/whatsapp";
import { DEFAULT_REMINDERS, type ReminderSettings } from "@/lib/domain/reminders";
import { connectorResults, sendWhatsApp, type WaMode } from "@/lib/integrations/whatsapp";
import { fmtDate } from "@/lib/format";
import { audit } from "./audit";
import { UserError } from "./errors";
import { invoicePdf } from "./invoice-pdf";
import { summarize } from "./members";
import { notify } from "./notifications";
import { getSetting } from "./settings";
import { getTax } from "./tax";
import { todayIso } from "./time";

export type { ReminderSettings };
export { DEFAULT_REMINDERS };

/** The reminder schedule (Settings › Reminders). Values a gym saved on the old WhatsApp form still count until the new row exists. */
export async function getReminderSettings(orgId: string): Promise<ReminderSettings> {
  const [legacy, row] = await Promise.all([getSetting<Partial<ReminderSettings>>(orgId, "whatsapp"), getSetting<Partial<ReminderSettings>>(orgId, "reminders")]);
  const inherited: Partial<ReminderSettings> = {};
  for (const k of ["expiryDays", "dedupDays", "dueEveryDays", "birthdays"] as const) if (legacy?.[k] !== undefined) Object.assign(inherited, { [k]: legacy[k] });
  return { ...DEFAULT_REMINDERS, ...inherited, ...(row ?? {}) };
}

export type WaSettings = { mode: WaMode } & ReminderSettings;
export const DEFAULT_WA: WaSettings = { mode: "demo", ...DEFAULT_REMINDERS };
export const getWaSettings = async (orgId: string): Promise<WaSettings> => ({
  mode: (await getSetting<{ mode?: WaMode }>(orgId, "whatsapp"))?.mode ?? "demo",
  ...(await getReminderSettings(orgId)),
});

/** The gym's templates, creating the defaults the first time. */
export async function listTemplates(orgId: string) {
  const have = await db.whatsAppTemplate.findMany({ where: { orgId } });
  const missing = DEFAULT_TEMPLATES.filter((t) => !have.some((h) => h.key === t.key));
  if (missing.length) {
    await db.whatsAppTemplate.createMany({ data: missing.map((t) => ({ ...t, orgId })), skipDuplicates: true });
    return db.whatsAppTemplate.findMany({ where: { orgId } }).then(order);
  }
  return order(have);
}
const order = <T extends { key: string }>(ts: T[]) => [...ts].sort((a, b) => DEFAULT_TEMPLATES.findIndex((d) => d.key === a.key) - DEFAULT_TEMPLATES.findIndex((d) => d.key === b.key));

export async function updateTemplate(u: CurrentUser, key: string, t: { body: string; metaTemplateName?: string; language: string; autoSend: boolean }) {
  await listTemplates(u.orgId);
  const before = await db.whatsAppTemplate.findUnique({ where: { orgId_key: { orgId: u.orgId, key } } });
  if (!before) throw new UserError("Template not found.");
  await db.$transaction(async (tx) => {
    const after = await tx.whatsAppTemplate.update({ where: { id: before.id }, data: { body: t.body, metaTemplateName: t.metaTemplateName ?? null, language: t.language, autoSend: t.autoSend } });
    await audit(tx, { orgId: u.orgId, userId: u.id, action: "whatsapp.template", entity: "WhatsAppTemplate", entityId: key, before, after });
  });
}

/** Everything a template can mention about a member right now. */
export async function memberVars(orgId: string, memberId: string, extra: TemplateVars = {}): Promise<TemplateVars> {
  const [m, gym, tax] = await Promise.all([
    db.member.findUniqueOrThrow({ where: { id: memberId } }),
    getSetting<{ name?: string }>(orgId, "gym"),
    getTax(orgId),
  ]);
  const [s, current, org] = await Promise.all([
    summarize([memberId]).then((x) => x.get(memberId)!),
    db.membership.findFirst({ where: { memberId, status: "VALID" }, orderBy: { endDate: "desc" }, include: { plan: true } }),
    db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } }),
  ]);
  const plan = current?.plan;
  const renewal = plan ? plan.price - plan.discount + (tax.enabled && plan.gstApplicable ? Math.round(((plan.price - plan.discount) * tax.rate) / 100) : 0) : 0;
  return {
    member_name: m.name.split(" ")[0] ?? m.name,
    member_id: m.code,
    plan_name: plan?.name ?? "",
    start_date: current ? fmtDate(current.startDate) : "",
    expiry_date: s.latestEnd ? fmtDate(s.latestEnd) : "",
    amount: rupeesText(renewal),
    pending_amount: rupeesText(s.outstanding),
    gym_name: gym?.name ?? org.name,
    ...extra,
  };
}

export type SendOpts = {
  orgId: string;
  memberId: string;
  key: string;
  /** Staff who sent it; null for automatic messages. */
  userId?: string | null;
  vars?: TemplateVars;
  /** Replaces the template body (custom message). */
  body?: string;
  /** Attach this invoice's PDF. */
  invoiceId?: string;
  /** Automatic trigger: respects the template's auto-send switch. */
  auto?: boolean;
  /** Skip the reminder de-dup check. */
  force?: boolean;
};

/**
 * Renders and sends one template to one member, and records the result. Never throws for
 * provider problems: a failure is stored with its error and raises an alert (rule 6).
 * Returns null when nothing was sent (auto-send off, duplicate reminder, no WhatsApp number).
 */
export async function sendTemplate(o: SendOpts) {
  const settings = await getWaSettings(o.orgId);
  const tpl = (await listTemplates(o.orgId)).find((t) => t.key === o.key);
  if (!tpl) throw new UserError("Template not found.");
  if (o.auto && !tpl.autoSend) return null;
  const member = await db.member.findUniqueOrThrow({ where: { id: o.memberId } });
  if (member.walkIn) return null;
  if (!o.force && REMINDER_KEYS.includes(o.key)) {
    const since = new Date(Date.now() - settings.dedupDays * 86_400_000);
    const recent = await db.whatsAppMessage.findFirst({ where: { memberId: o.memberId, templateKey: o.key, sentAt: { gte: since }, status: { not: "Failed" } } });
    if (recent) return null;
  }
  const to = waNumber(member.whatsapp ?? member.phone);
  const vars = await memberVars(o.orgId, o.memberId, o.vars);
  const source = o.body ?? tpl.body;
  const body = render(source, vars);
  const pdf = o.invoiceId ? await invoicePdf(await systemUser(o.orgId), o.invoiceId) : null;

  const msg = await db.whatsAppMessage.create({
    data: { orgId: o.orgId, memberId: o.memberId, templateKey: o.key, toNumber: to ?? member.phone, body, attachment: pdf ? `invoice:${o.invoiceId}` : null, provider: settings.mode, status: "Queued", sentById: o.userId ?? null },
  });
  const result = to
    ? await sendWhatsApp(settings.mode, {
        localId: msg.id,
        to,
        body,
        template: settings.mode === "cloud" && tpl.metaTemplateName && !o.body ? { name: tpl.metaTemplateName, language: tpl.language, params: placeholders(tpl.body).map((k) => vars[k as keyof TemplateVars] ?? "") } : undefined,
        pdf: pdf ? { bytes: pdf.bytes, filename: pdf.filename } : undefined,
      })
    : { status: "Failed" as const, error: "No valid WhatsApp number on the member's profile." };
  const saved = await db.whatsAppMessage.update({ where: { id: msg.id }, data: { status: result.status, providerMessageId: result.providerMessageId ?? null, error: result.error ?? null } });
  if (result.status === "Failed") {
    await db.$transaction((tx) => notify(tx, { orgId: o.orgId, branchId: member.branchId, type: "WA_FAILED", text: `WhatsApp "${tpl.name}" to ${member.name} failed: ${result.error}`, link: `/whatsapp?status=Failed` }));
  }
  return saved;
}

/**
 * Sends one free-form text to the gym's own number (FITRON renewal reminders), not to a member: no
 * template row, no de-dup. Recorded like every other message, so it shows on the WhatsApp page with
 * "—" as the member; a failure raises the usual alert and never throws.
 */
export async function sendGymWhatsApp(o: { orgId: string; key: string; to: string; body: string }) {
  const mode = (await getSetting<{ mode?: WaMode }>(o.orgId, "whatsapp"))?.mode ?? "demo";
  const msg = await db.whatsAppMessage.create({ data: { orgId: o.orgId, memberId: null, templateKey: o.key, toNumber: o.to, body: o.body, provider: mode, status: "Queued", sentById: null } });
  const result = await sendWhatsApp(mode, { localId: msg.id, to: o.to, body: o.body });
  const saved = await db.whatsAppMessage.update({ where: { id: msg.id }, data: { status: result.status, providerMessageId: result.providerMessageId ?? null, error: result.error ?? null } });
  if (result.status === "Failed") {
    await db.$transaction((tx) => notify(tx, { orgId: o.orgId, type: "WA_FAILED", text: `WhatsApp renewal reminder to ${o.to} failed: ${result.error}`, link: "/whatsapp?status=Failed" }));
  }
  return saved;
}

/**
 * Runs an automatic message after the response is sent, so a slow provider never delays the desk.
 * Outside a request (jobs, tests) it runs in the background.
 */
export function sendLater(o: Omit<SendOpts, "auto">) {
  const run = () => sendTemplate({ ...o, auto: true }).catch((e) => console.error("WhatsApp auto-send failed", e));
  try {
    after(run);
  } catch {
    void run();
  }
}

export async function listMessages(u: CurrentUser, f: { status?: string; key?: string; q?: string; memberId?: string; page?: number; pageSize?: number }) {
  const pageSize = f.pageSize ?? 50;
  const page = Math.max(1, f.page ?? 1);
  const where: Prisma.WhatsAppMessageWhereInput = {
    orgId: u.orgId,
    OR: [{ memberId: null }, { member: { branchId: { in: u.branchIds } } }],
    ...(f.status ? { status: f.status } : {}),
    ...(f.key ? { templateKey: f.key } : {}),
    ...(f.memberId ? { memberId: f.memberId } : {}),
    ...(f.q ? { AND: [{ OR: [{ member: { name: { contains: f.q, mode: "insensitive" } } }, { toNumber: { contains: f.q.replace(/\D/g, "") || f.q } }] }] } : {}),
  };
  const [rows, total, counts] = await Promise.all([
    db.whatsAppMessage.findMany({ where, orderBy: { sentAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { member: { select: { id: true, name: true, code: true } } } }),
    db.whatsAppMessage.count({ where }),
    db.whatsAppMessage.groupBy({ by: ["status"], where: { orgId: u.orgId, sentAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: { _all: true } }),
  ]);
  return { rows, total, page, pageSize, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<string, number> };
}

/** Delivery updates from Meta's webhook. Status only moves forward. */
export async function applyDeliveryStatus(providerMessageId: string, status: string, at: Date, error?: string) {
  const msg = await db.whatsAppMessage.findFirst({ where: { providerMessageId } });
  if (!msg) return;
  const rank = { Logged: 0, Queued: 1, Sent: 2, Delivered: 3, Read: 4, Failed: 5 } as Record<string, number>;
  const next = { sent: "Sent", delivered: "Delivered", read: "Read", failed: "Failed" }[status];
  if (!next || (rank[next] ?? 0) <= (rank[msg.status] ?? 0)) return;
  await db.whatsAppMessage.update({
    where: { id: msg.id },
    data: { status: next, ...(next === "Delivered" ? { deliveredAt: at } : {}), ...(next === "Read" ? { readAt: at, deliveredAt: msg.deliveredAt ?? at } : {}), ...(next === "Failed" ? { error: error ?? "Failed" } : {}) },
  });
  if (next === "Failed") {
    const member = msg.memberId ? await db.member.findUnique({ where: { id: msg.memberId }, select: { name: true, branchId: true } }) : null;
    await db.$transaction((tx) => notify(tx, { orgId: msg.orgId, branchId: member?.branchId, type: "WA_FAILED", text: `WhatsApp to ${member?.name ?? msg.toNumber} failed: ${error ?? "unknown error"}`, link: "/whatsapp?status=Failed" }));
  }
}

/** Pulls final statuses for messages the linked-phone connector still has queued. */
export async function refreshQueued(orgId: string) {
  const queued = await db.whatsAppMessage.findMany({ where: { orgId, provider: "connector", status: "Queued", sentAt: { gte: new Date(Date.now() - 3 * 86_400_000) } }, select: { id: true } });
  const res = await connectorResults(queued.map((q) => q.id));
  let n = 0;
  for (const [id, r] of Object.entries(res)) {
    const status = /sent/i.test(r.status) ? "Sent" : /fail|error/i.test(r.status) ? "Failed" : null;
    if (!status) continue;
    await db.whatsAppMessage.update({ where: { id }, data: { status, error: r.error ?? null } });
    n++;
  }
  return n;
}

/** Sends one custom message to many members (capped, since WhatsApp limits bulk sending). */
export async function sendCampaign(u: CurrentUser, memberIds: string[], body: string) {
  if (memberIds.length > 250) throw new UserError("Send to 250 members or fewer at a time.");
  if (!body.trim()) throw new UserError("Write the message first.", "body");
  const allowed = await db.member.findMany({ where: { id: { in: memberIds }, orgId: u.orgId, branchId: { in: u.branchIds }, deletedAt: null, walkIn: false }, select: { id: true } });
  let sent = 0;
  let failed = 0;
  for (const m of allowed) {
    const r = await sendTemplate({ orgId: u.orgId, memberId: m.id, key: "campaign", body, userId: u.id, force: true });
    if (r?.status === "Failed") failed++;
    else if (r) sent++;
  }
  await db.$transaction((tx) => audit(tx, { orgId: u.orgId, userId: u.id, action: "whatsapp.campaign", entity: "WhatsAppMessage", entityId: todayIso(), after: { recipients: allowed.length, sent, failed, body } }));
  return { sent, failed };
}
