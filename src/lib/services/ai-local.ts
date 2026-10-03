import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { addDays, daysBetween } from "@/lib/domain/dates";
import { profitAndLoss } from "./accounting";
import { listMembers } from "./members";
import { weekSchedule, weekStart } from "./classes";
import { fromIso, todayIso } from "./time";
import type { ChatEvent } from "./ai";

/**
 * Fitron AI without a model (no ANTHROPIC_API_KEY): the prototype's built-in answers (A.aiLocal),
 * worked out from live data. Like the model, it only drafts messages; a person presses Send.
 */

const inr = (p: number) => `${p < 0 ? "−" : ""}₹${Math.round(Math.abs(p) / 100).toLocaleString("en-IN")}`;

const BODY = {
  winback: "Hi {{member_name}}, we've missed you at the gym! Come back this week and your next personal training session is on us. Reply here and we'll book it for you.",
  due: "Hi {{member_name}}, a gentle reminder that you have a pending balance with us. You can pay at the front desk or by UPI. Thank you!",
  renewal: "Hi {{member_name}}, your membership is ending soon. Renew this week to keep your streak going. Reply here or visit the front desk.",
};

async function propose(u: CurrentUser, ids: string[], body: string, summary: string): Promise<ChatEvent | null> {
  if (!ids.length || !u.can("whatsapp.send")) return null;
  const p = await db.aiProposal.create({ data: { orgId: u.orgId, userId: u.id, kind: "WHATSAPP", memberIds: ids.slice(0, 250), body, summary } });
  return { type: "proposal", id: p.id, summary, members: Math.min(ids.length, 250), body };
}

export async function* localChat(u: CurrentUser, question: string): AsyncGenerator<ChatEvent> {
  const t = question.toLowerCase();
  const today = todayIso();
  const canMembers = u.can("members.view");
  const rows = canMembers ? (await listMembers(u, { all: true })).rows : [];
  const left = (r: (typeof rows)[number]) => (r.latestEnd ? daysBetween(r.latestEnd, today) : null);

  if (/follow|call today|who should/.test(t)) {
    yield { type: "tool", name: "list_members" };
    const parts: string[] = [];
    if (u.can("leads.manage")) {
      const leads = await db.lead.findMany({ where: { orgId: u.orgId, branchId: { in: u.branchIds }, stage: { notIn: ["Won", "Lost"] }, followUpOn: { lte: fromIso(today) } }, orderBy: { followUpOn: "asc" }, take: 6, select: { name: true, phone: true, stage: true } });
      if (leads.length) parts.push(`Leads to follow up:\n${leads.map((l) => `- ${l.name} (${l.stage.toLowerCase()}), ${l.phone}`).join("\n")}`);
    }
    if (canMembers) {
      const soon = rows.filter((r) => r.status !== "SUSPENDED" && left(r) != null && left(r)! >= 0 && left(r)! <= 3).sort((a, b) => left(a)! - left(b)!);
      if (soon.length) parts.push(`Expiring in the next 3 days:\n${soon.slice(0, 6).map((r) => `- ${r.name}, ${left(r) === 0 ? "today" : `${left(r)} days`}, ${r.phone}`).join("\n")}`);
      const owing = rows.filter((r) => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 4);
      if (owing.length) parts.push(`Largest balances:\n${owing.map((r) => `- ${r.name}: ${inr(r.outstanding)}, ${r.phone}`).join("\n")}`);
    }
    return yield { type: "text", text: parts.length ? parts.join("\n\n") : "Nobody needs a follow-up call today." };
  }
  if (canMembers && /risk|churn|miss|not coming|inactive|win.?back/.test(t)) {
    yield { type: "tool", name: "list_members" };
    const risky = await db.member.findMany({ where: { orgId: u.orgId, branchId: { in: u.branchIds }, deletedAt: null, walkIn: false, suspended: false, riskScore: { gte: 35 } }, orderBy: { riskScore: "desc" }, select: { id: true, code: true, name: true, riskReasons: true } });
    if (!risky.length) return yield { type: "text", text: "No members are at risk right now. Scores update every night from visits, expiry and dues." };
    yield { type: "text", text: `${risky.length} members are at risk of not renewing:\n${risky.slice(0, 6).map((m) => `- ${m.name} (${m.code}): ${m.riskReasons.join(", ").toLowerCase()}`).join("\n")}\n\nI can send them the win-back message. Nothing goes out until you confirm.` };
    const p = await propose(u, risky.map((m) => m.id), BODY.winback, `Win-back message to ${risky.length} members at risk`);
    if (p) yield p;
    return;
  }
  if (canMembers && /due|outstanding|pending|owe|collect/.test(t)) {
    yield { type: "tool", name: "list_members" };
    const owing = rows.filter((r) => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
    if (!owing.length) return yield { type: "text", text: "Nobody owes money right now." };
    yield { type: "text", text: `${inr(owing.reduce((s, r) => s + r.outstanding, 0))} is outstanding across ${owing.length} members. Largest:\n${owing.slice(0, 6).map((r) => `- ${r.name}: ${inr(r.outstanding)}`).join("\n")}` };
    const p = await propose(u, owing.map((r) => r.id), BODY.due, `Payment reminder to ${owing.length} members with dues`);
    if (p) yield p;
    return;
  }
  if (canMembers && /expir|renew/.test(t)) {
    yield { type: "tool", name: "list_members" };
    const soon = rows.filter((r) => r.status !== "SUSPENDED" && left(r) != null && left(r)! >= 0 && left(r)! <= 7).sort((a, b) => left(a)! - left(b)!);
    if (!soon.length) return yield { type: "text", text: "No memberships expire in the next 7 days." };
    yield { type: "text", text: `${soon.length} memberships expire in the next 7 days:\n${soon.slice(0, 8).map((r) => `- ${r.name}, ${r.planName ?? "—"}, ${left(r) === 0 ? "today" : `${left(r)} days`}`).join("\n")}` };
    const p = await propose(u, soon.map((r) => r.id), BODY.renewal, `Renewal reminder to ${soon.length} members expiring this week`);
    if (p) yield p;
    return;
  }
  if (/class|underbook|booking/.test(t) && u.can("classes.manage")) {
    yield { type: "tool", name: "class_and_attendance" };
    const week = (await weekSchedule(u, weekStart(today))).filter((s) => s.date >= today);
    const low = week.filter((s) => s.capacity && s.booked / s.capacity < 0.5).sort((a, b) => a.booked / a.capacity - b.booked / b.capacity);
    return yield { type: "text", text: low.length ? `${low.length} classes left this week are under half full:\n${low.slice(0, 8).map((s) => `- ${s.name}, ${s.date} ${s.startTime}: ${s.booked}/${s.capacity}`).join("\n")}` : "Every class left this week is at least half full." };
  }
  if (/revenue|profit|month|sales|income|going/.test(t) && u.can("accounting.view")) {
    yield { type: "tool", name: "revenue_breakdown" };
    const from = `${today.slice(0, 7)}-01`;
    const lastFrom = `${addDays(from, -1).slice(0, 7)}-01`;
    // The same number of days into last month, never past its end.
    const sameDay = addDays(lastFrom, daysBetween(today, from));
    const lastTo = sameDay < from ? sameDay : addDays(from, -1);
    const [now, prev] = await Promise.all([profitAndLoss(u, { from, to: today }), profitAndLoss(u, { from: lastFrom, to: lastTo })]);
    const joined = async (a: string, b: string) => db.member.count({ where: { orgId: u.orgId, branchId: { in: u.branchIds }, deletedAt: null, walkIn: false, createdAt: { gte: fromIso(a), lt: fromIso(addDays(b, 1)) } } });
    const [nNow, nPrev] = await Promise.all([joined(from, today), joined(lastFrom, lastTo)]);
    return yield {
      type: "text",
      text: `This month so far: revenue ${inr(now.totalRevenue)}, collections ${inr(now.collected)}, expenses ${inr(now.totalExpenses + now.depreciation)}, net ${inr(now.net)}.\nSame days last month: revenue ${inr(prev.totalRevenue)}, net ${inr(prev.net)}.\n${nNow} new members this month vs ${nPrev} in the same days last month.`,
    };
  }
  yield { type: "tool", name: "get_overview" };
  const active = rows.filter((r) => left(r) != null && left(r)! >= 0 && r.status !== "SUSPENDED").length;
  const expiring = rows.filter((r) => left(r) != null && left(r)! >= 0 && left(r)! <= 7).length;
  const dues = rows.reduce((s, r) => s + r.outstanding, 0);
  const checkins = await db.attendance.count({ where: { branchId: { in: u.branchIds }, date: fromIso(today) } });
  const atRisk = canMembers ? await db.member.count({ where: { orgId: u.orgId, branchId: { in: u.branchIds }, deletedAt: null, walkIn: false, suspended: false, riskScore: { gte: 35 } } }) : 0;
  yield {
    type: "text",
    text: `${canMembers ? `Today: ${active} active members, ${checkins} check-ins, ${expiring} expiring this week, ${inr(dues)} outstanding and ${atRisk} members at risk.` : `Today: ${checkins} check-ins so far.`}\nAsk me about renewals, dues, members at risk, classes or this month's numbers.`,
  };
}

export type BriefCard = { icon: "risk" | "renew" | "money" | "trend" | "stock" | "autopay" | "lead"; title: string; text: string; action?: { label: string; href?: string; ask?: string } };

/** "Today's brief" on the Fitron AI page (prototype): what needs attention, by what the user may see. */
export async function aiBrief(u: CurrentUser): Promise<BriefCard[]> {
  const today = todayIso();
  const scope = { orgId: u.orgId, branchId: { in: u.branchIds } };
  const out: BriefCard[] = [];
  if (u.can("members.view")) {
    const rows = (await listMembers(u, { all: true })).rows;
    const risky = await db.member.findMany({ where: { ...scope, deletedAt: null, walkIn: false, suspended: false, riskScore: { gte: 35 } }, orderBy: { riskScore: "desc" }, select: { name: true, riskReasons: true } });
    out.push({
      icon: "risk",
      title: `${risky.length} members at risk of not renewing`,
      text: risky.length ? `${risky.slice(0, 3).map((m) => `${m.name.split(" ")[0]} (${(m.riskReasons[0] ?? "low activity").toLowerCase()})`).join(", ")}${risky.length > 3 ? ` and ${risky.length - 3} more.` : "."}` : "Nobody is drifting away right now.",
      action: risky.length && u.can("whatsapp.send") ? { label: "Review win-back messages", ask: "Which members are at risk?" } : undefined,
    });
    const soon = rows.filter((r) => r.latestEnd && daysBetween(r.latestEnd, today) >= 0 && daysBetween(r.latestEnd, today) <= 7);
    const onAutopay = soon.length ? await db.autopayMandate.count({ where: { memberId: { in: soon.map((r) => r.id) }, status: "Active" } }) : 0;
    out.push({ icon: "renew", title: `${soon.length} renewals due this week`, text: soon.length ? `${onAutopay} will renew by UPI autopay.` : "Nothing due.", action: { label: "Open renewal list", href: "/renewals" } });
    const owing = rows.filter((r) => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
    out.push({
      icon: "money",
      title: `${inr(owing.reduce((s, r) => s + r.outstanding, 0))} to collect`,
      text: `${owing.length} members owe money. The five largest balances make up ${inr(owing.slice(0, 5).reduce((s, r) => s + r.outstanding, 0))}.`,
      action: owing.length && u.can("whatsapp.send") ? { label: "Send payment reminders", ask: "Draft reminders for pending dues" } : undefined,
    });
  }
  if (u.can("accounting.view")) {
    const from = `${today.slice(0, 7)}-01`;
    const lastFrom = `${addDays(from, -1).slice(0, 7)}-01`;
    const sameDay = addDays(lastFrom, daysBetween(today, from));
    const [now, prev] = await Promise.all([profitAndLoss(u, { from, to: today }), profitAndLoss(u, { from: lastFrom, to: sameDay < from ? sameDay : addDays(from, -1) })]);
    const pct = prev.totalRevenue ? Math.round(((now.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100) : null;
    out.push({ icon: "trend", title: `Revenue ${pct == null ? "this month" : pct >= 0 ? `up ${pct}%` : `down ${-pct}%`} vs last month`, text: `${inr(now.totalRevenue)} so far against ${inr(prev.totalRevenue)} by this day last month.`, action: { label: "How is this month going?", ask: "How is this month vs last month?" } });
  }
  if (u.can("products.manage")) {
    const low = await db.product.findMany({ where: { ...scope, active: true, stock: { not: null }, reorderLevel: { not: null } }, select: { name: true, stock: true, reorderLevel: true } });
    const need = low.filter((p) => p.stock! <= p.reorderLevel!);
    if (need.length) out.push({ icon: "stock", title: `${need.length} products low on stock`, text: need.slice(0, 4).map((p) => `${p.name} (${p.stock} left)`).join(", "), action: { label: "Open inventory", href: "/pos#inventory" } });
  }
  if (u.can("autopay.manage")) {
    const failed = await db.autopayMandate.count({ where: { ...scope, status: { in: ["Failed", "Halted"] } } });
    if (failed) out.push({ icon: "autopay", title: `${failed} autopay debit${failed === 1 ? "" : "s"} failed`, text: "Retry or collect at the desk.", action: { label: "Open UPI autopay", href: "/autopay?f=Attention" } });
  }
  if (u.can("leads.manage")) {
    const due = await db.lead.count({ where: { ...scope, stage: { notIn: ["Won", "Lost"] }, followUpOn: { lte: fromIso(today) } } });
    if (due) out.push({ icon: "lead", title: `${due} lead follow-up${due === 1 ? "" : "s"} due`, text: "Call or WhatsApp them today while they're still interested.", action: { label: "Open leads", href: "/leads" } });
  }
  return out;
}
