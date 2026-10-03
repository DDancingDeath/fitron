import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { addDays, daysBetween } from "@/lib/domain/dates";
import { invoiceState } from "@/lib/domain/billing";
import { audit } from "./audit";
import { JOBS } from "./jobs";
import { summarize } from "./members";
import { getSetting } from "./settings";
import { fromIso, toIso, todayIso } from "./time";
import { getWaSettings, listTemplates, type WaSettings } from "./whatsapp";

/**
 * "Today's automation" on the WhatsApp screen (prototype): what the daily reminder rules will send today
 * and what they will skip, worked out the same way the daily job does, without sending anything.
 */

export const EXPIRY_KEYS: Record<string, number> = { exp7: 7, exp3: 3, exp1: 1, expired: 0 };
const REMINDER_JOBS = ["reminders.expiry", "reminders.dues", "reminders.birthday", "reminders.winback"];
type Row = { key: string; send: number; skipped: number };

/** The rule behind each template in words, as the prototype's template cards show it. */
export function ruleText(key: string, trigger: string, s: WaSettings) {
  if (key in EXPIRY_KEYS) {
    const d = EXPIRY_KEYS[key]!;
    if (!s.expiryDays.includes(d)) return "Off · turn this day on in WhatsApp settings";
    return `Daily · ${d === 0 ? "on the expiry date" : `${d} day${d === 1 ? "" : "s"} before expiry`} · skips members on UPI autopay`;
  }
  if (key === "due") return s.dueEveryDays ? `Daily · every ${s.dueEveryDays} days while a balance is overdue` : "Off · turn it on in WhatsApp settings";
  if (key === "birthday") return s.birthdays ? "Daily · on the member's birthday" : "Off · turn it on in WhatsApp settings";
  if (key === "autopay") return "Daily · the day before each UPI autopay debit";
  if (key === "winback") return "Daily · active members who haven't visited for 14 days · once a month";
  if (key === "campaign") return "Sent by staff from New campaign";
  return `When it happens · ${trigger}`;
}

export async function automationPreview(u: CurrentUser, today = todayIso()): Promise<Row[]> {
  const s = await getWaSettings(u.orgId);
  const tpls = new Map((await listTemplates(u.orgId)).map((t) => [t.key, t]));
  const on = (k: string) => tpls.get(k)?.autoSend ?? false;
  const members = await db.member.findMany({ where: { orgId: u.orgId, branchId: { in: u.branchIds }, deletedAt: null, walkIn: false, suspended: false }, select: { id: true, dob: true, phone: true, whatsapp: true } });
  const ids = members.map((m) => m.id);
  const sums = await summarize(ids, today);
  const autopay = new Set((await db.autopayMandate.findMany({ where: { memberId: { in: ids }, status: "Active" }, select: { memberId: true } })).map((m) => m.memberId));
  const recent = await db.whatsAppMessage.findMany({ where: { memberId: { in: ids }, sentAt: { gte: new Date(Date.now() - Math.max(s.dedupDays, s.dueEveryDays || 0) * 86_400_000) }, status: { not: "Failed" } }, select: { memberId: true, templateKey: true, sentAt: true } });
  const sentWithin = (memberId: string, key: string, days: number) => recent.some((r) => r.memberId === memberId && r.templateKey === key && r.sentAt.getTime() >= Date.now() - days * 86_400_000);
  const noNumber = (m: (typeof members)[number]) => !(m.whatsapp ?? m.phone);
  const out: Row[] = [];

  for (const [key, d] of Object.entries(EXPIRY_KEYS)) {
    if (!on(key) || !s.expiryDays.includes(d)) continue;
    let send = 0;
    let skipped = 0;
    for (const m of members) {
      const end = sums.get(m.id)?.latestEnd;
      if (!end || daysBetween(end, today) !== d) continue;
      if (autopay.has(m.id) || noNumber(m) || sentWithin(m.id, key, s.dedupDays)) skipped++;
      else send++;
    }
    out.push({ key, send, skipped });
  }
  if (on("due") && s.dueEveryDays) {
    const invs = await db.invoice.findMany({ where: { memberId: { in: ids }, status: "ISSUED", dueDate: { lt: fromIso(today) } }, include: { payments: { select: { amount: true, status: true } } } });
    const owing = new Set(invs.filter((i) => invoiceState({ total: i.total, cancelled: false, dueDate: toIso(i.dueDate) }, i.payments as { amount: number; status: "SUCCESS" | "REVERSED" }[], today).balance > 0).map((i) => i.memberId));
    let send = 0;
    let skipped = 0;
    for (const id of owing) {
      const m = members.find((x) => x.id === id)!;
      if (noNumber(m) || sentWithin(id, "due", s.dueEveryDays)) skipped++;
      else send++;
    }
    out.push({ key: "due", send, skipped });
  }
  if (on("birthday") && s.birthdays) {
    const md = today.slice(5);
    const born = members.filter((m) => m.dob && toIso(m.dob).slice(5) === md);
    out.push({ key: "birthday", send: born.filter((m) => !noNumber(m) && !sentWithin(m.id, "birthday", s.dedupDays)).length, skipped: born.filter((m) => noNumber(m) || sentWithin(m.id, "birthday", s.dedupDays)).length });
  }
  if (on("winback")) {
    const active = members.filter((m) => (sums.get(m.id)?.latestEnd ?? "") >= today);
    const seen = new Set((await db.attendance.findMany({ where: { memberId: { in: active.map((m) => m.id) }, date: { gte: fromIso(addDays(today, -14)) } }, select: { memberId: true }, distinct: ["memberId"] })).map((a) => a.memberId));
    const away = active.filter((m) => !seen.has(m.id));
    const lately = new Set((await db.whatsAppMessage.findMany({ where: { memberId: { in: away.map((m) => m.id) }, templateKey: "winback", sentAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, status: { not: "Failed" } }, select: { memberId: true } })).map((x) => x.memberId));
    out.push({ key: "winback", send: away.filter((m) => !noNumber(m) && !lately.has(m.id)).length, skipped: away.filter((m) => noNumber(m) || lately.has(m.id)).length });
  }
  if (on("autopay")) {
    const n = await db.autopayMandate.count({ where: { memberId: { in: ids }, status: "Active", nextDebitOn: fromIso(addDays(today, 1)) } });
    out.push({ key: "autopay", send: n, skipped: 0 });
  }
  return out.filter((r) => r.send || r.skipped);
}

type Run = { ts: string; sent: number };

/** "Send N due now": the daily reminder rules, run straight away. Repeats are skipped by the no-repeat windows. */
export async function runAutomationNow(u: CurrentUser, today = todayIso()) {
  let sent = 0;
  for (const job of JOBS.filter((j) => REMINDER_JOBS.includes(j.name))) sent += Number((await job.run(u.orgId, today)).sent ?? 0);
  const runs = ((await getSetting<Run[]>(u.orgId, "wa_auto_runs")) ?? []).slice(0, 9);
  const value = [{ ts: new Date().toISOString(), sent }, ...runs];
  await db.setting.upsert({ where: { orgId_key: { orgId: u.orgId, key: "wa_auto_runs" } }, create: { orgId: u.orgId, key: "wa_auto_runs", value }, update: { value } });
  await db.$transaction((tx) => audit(tx, { orgId: u.orgId, userId: u.id, action: "whatsapp.automation.run", entity: "Setting", entityId: "wa_auto_runs", after: { sent } }));
  return sent;
}

/** When the reminders last ran: the daily job, or someone pressing "Send due now". */
export async function lastAutomationRun(orgId: string) {
  const [job, manual] = await Promise.all([
    db.jobRun.findFirst({ where: { orgId, name: { in: REMINDER_JOBS }, finishedAt: { not: null } }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
    getSetting<Run[]>(orgId, "wa_auto_runs"),
  ]);
  const times = [job?.finishedAt?.getTime() ?? 0, manual?.[0] ? Date.parse(manual[0].ts) : 0];
  const at = Math.max(...times);
  return { at: at ? new Date(at) : null, runs: manual ?? [] };
}
