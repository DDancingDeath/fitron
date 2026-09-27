import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { addDays } from "@/lib/domain/dates";
import { listMembers } from "./members";
import { profitAndLoss } from "./accounting";
import { atRisk } from "./insights";
import { audienceIds, AUDIENCES, type Audience } from "./audience";
import { fromIso, toIso, todayIso } from "./time";

// Read-only tools the assistant can call, each limited to what the signed-in staff member may see.
// The only "write" is propose_action, which stores a suggestion that a person must confirm.

const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const TOOL_DEFS = [
  { name: "get_overview", description: "Headline numbers for the gym today: members by status, dues, today's check-ins, this month's revenue and collections.", input_schema: { type: "object", properties: {} } },
  {
    name: "list_members",
    description: "List members in a group, most relevant first.",
    input_schema: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["active", "expiring", "expired", "dues", "payment_pending", "suspended", "at_risk"], description: "expiring = within 7 days; dues = owes money; at_risk = high churn risk" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: ["filter"],
    },
  },
  { name: "find_member", description: "Look up one member by name, phone or member ID, with plan, expiry, dues and recent visits.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  {
    name: "revenue_breakdown",
    description: "Profit and loss for a period: revenue by category, expenses by group, depreciation, collections by payment method. Dates are YYYY-MM-DD.",
    input_schema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
  },
  { name: "class_and_attendance", description: "Check-ins per day and class bookings for the last N days (default 14).", input_schema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 60 } } } },
  {
    name: "propose_action",
    description:
      "Suggest sending a WhatsApp message to some members. Nothing is sent: the staff member sees the suggestion and must press Send. Use either member_ids (from list_members or find_member) or an audience. Write the message as the gym, in the language the user wrote in; {{member_name}} is replaced with each member's name.",
    input_schema: {
      type: "object",
      properties: {
        member_ids: { type: "array", items: { type: "string" }, maxItems: 250 },
        audience: { type: "string", enum: Object.keys(AUDIENCES) },
        message: { type: "string" },
        summary: { type: "string", description: "One line describing the action, e.g. 'Remind 6 members with dues'" },
      },
      required: ["message", "summary"],
    },
  },
] as const;

type Input = Record<string, unknown>;
const STATUS: Record<string, string> = { active: "ACTIVE", expiring: "EXPIRING_SOON", expired: "EXPIRED", payment_pending: "PAYMENT_PENDING", suspended: "SUSPENDED" };

export async function runTool(u: CurrentUser, name: string, input: Input): Promise<unknown> {
  const today = todayIso();
  switch (name) {
    case "get_overview": {
      const out: Record<string, unknown> = { today, branch: u.branch === "ALL" ? "All branches" : u.branches.find((b) => b.id === u.branch)?.name };
      if (u.can("members.view")) {
        const m = await listMembers(u, { all: true });
        out.members = m.counts;
        out.totalDues = rupees(m.rows.reduce((s, r) => s + r.outstanding, 0));
      }
      out.checkInsToday = await db.attendance.count({ where: { branchId: { in: u.branchIds }, date: fromIso(today) } });
      if (u.can("accounting.view")) {
        const pl = await profitAndLoss(u, { from: `${today.slice(0, 7)}-01`, to: today });
        out.thisMonth = { revenue: rupees(pl.totalRevenue), expenses: rupees(pl.totalExpenses + pl.depreciation), net: rupees(pl.net), collected: rupees(pl.collected) };
      }
      return out;
    }
    case "list_members": {
      if (!u.can("members.view")) return { error: "This staff member can't see members." };
      const limit = Math.min(50, Number(input.limit) || 20);
      const f = String(input.filter);
      if (f === "at_risk") return (await atRisk(u, limit)).map((m) => ({ id: m.id, code: m.code, name: m.name, phone: m.phone, risk: m.riskScore, why: m.riskReasons }));
      const { rows } = await listMembers(u, { all: true, status: STATUS[f] });
      const picked = f === "dues" ? rows.filter((r) => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding) : f === "expiring" ? rows.sort((a, b) => (a.latestEnd ?? "").localeCompare(b.latestEnd ?? "")) : rows;
      return { count: picked.length, members: picked.slice(0, limit).map((r) => ({ id: r.id, code: r.code, name: r.name, phone: r.phone, plan: r.planName, ends: r.latestEnd, dues: rupees(r.outstanding), status: r.status })) };
    }
    case "find_member": {
      if (!u.can("members.view")) return { error: "This staff member can't see members." };
      const { rows } = await listMembers(u, { all: true, q: String(input.query ?? "") });
      const top = rows.slice(0, 5);
      const visits = await db.attendance.findMany({ where: { memberId: { in: top.map((r) => r.id) } }, orderBy: { date: "desc" }, select: { memberId: true, date: true }, take: 50 });
      const risk = await db.member.findMany({ where: { id: { in: top.map((r) => r.id) } }, select: { id: true, riskScore: true, riskReasons: true } });
      return {
        matches: rows.length,
        members: top.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          phone: r.phone,
          plan: r.planName,
          ends: r.latestEnd,
          dues: rupees(r.outstanding),
          status: r.status,
          lastVisits: visits.filter((v) => v.memberId === r.id).slice(0, 5).map((v) => toIso(v.date)),
          risk: risk.find((x) => x.id === r.id)?.riskScore ?? null,
        })),
      };
    }
    case "revenue_breakdown": {
      if (!u.can("accounting.view")) return { error: "This staff member can't see accounts." };
      const from = String(input.from);
      const to = String(input.to);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return { error: "Dates must be YYYY-MM-DD." };
      const pl = await profitAndLoss(u, { from, to });
      const money = (xs: { key: string; amount: number }[]) => Object.fromEntries(xs.map((x) => [x.key, rupees(x.amount)]));
      return {
        period: { from, to },
        revenue: money(pl.revenue),
        totalRevenue: rupees(pl.totalRevenue),
        expenses: money(pl.expenseGroups),
        totalExpenses: rupees(pl.totalExpenses),
        depreciation: rupees(pl.depreciation),
        disposalGain: rupees(pl.disposalGain),
        disposalLoss: rupees(pl.disposalLoss),
        net: rupees(pl.net),
        gstCollected: rupees(pl.gstCollected),
        collectedByMethod: money(pl.collectedByMethod),
      };
    }
    case "class_and_attendance": {
      const days = Math.min(60, Number(input.days) || 14);
      const from = fromIso(addDays(today, -(days - 1)));
      const [att, bookings] = await Promise.all([
        db.attendance.groupBy({ by: ["date"], where: { branchId: { in: u.branchIds }, date: { gte: from } }, _count: { _all: true }, orderBy: { date: "asc" } }),
        db.booking.findMany({ where: { date: { gte: from, lte: fromIso(today) }, classSlot: { branchId: { in: u.branchIds } } }, select: { status: true, classSlot: { select: { name: true, capacity: true } } } }),
      ]);
      const classes = new Map<string, { booked: number; attended: number; noShow: number; waitlist: number }>();
      for (const b of bookings) {
        const c = classes.get(b.classSlot.name) ?? { booked: 0, attended: 0, noShow: 0, waitlist: 0 };
        if (b.status === "Waitlist") c.waitlist++;
        else c.booked++;
        if (b.status === "Attended") c.attended++;
        if (b.status === "No-show") c.noShow++;
        classes.set(b.classSlot.name, c);
      }
      return { checkInsByDay: att.map((a) => ({ date: toIso(a.date), visits: a._count._all })), classes: Object.fromEntries(classes) };
    }
    case "propose_action": {
      if (!u.can("whatsapp.send")) return { error: "This staff member can't send WhatsApp messages." };
      const message = String(input.message ?? "").trim();
      if (!message) return { error: "Write the message." };
      let ids = Array.isArray(input.member_ids) ? input.member_ids.map(String) : [];
      if (!ids.length && input.audience && String(input.audience) in AUDIENCES) ids = await audienceIds(u, String(input.audience) as Audience);
      const allowed = await db.member.findMany({ where: { id: { in: ids }, orgId: u.orgId, branchId: { in: u.branchIds }, deletedAt: null, walkIn: false }, select: { id: true } });
      if (!allowed.length) return { error: "None of those members were found." };
      if (allowed.length > 250) return { error: "That's more than 250 members. Narrow the group." };
      const p = await db.aiProposal.create({ data: { orgId: u.orgId, userId: u.id, kind: "WHATSAPP", memberIds: allowed.map((m) => m.id), body: message, summary: String(input.summary ?? "Send a WhatsApp message").slice(0, 200) } });
      return { proposal_id: p.id, members: allowed.length, note: "Shown to the staff member with a Send button. Tell them to check the message and press Send." };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
