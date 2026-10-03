import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { addDays, daysBetween } from "@/lib/domain/dates";
import { invoiceState } from "@/lib/domain/billing";
import { runAutopayDay } from "./autopay";
import { isUniqueViolation } from "./errors";
import { summarize } from "./members";
import { notify } from "./notifications";
import { computeRisk } from "./insights";
import { syncDevices } from "./biometric";
import { billingReminders } from "./saas";
import { fromIso, istInstant, toIso, todayIso } from "./time";
import { getWaSettings, refreshQueued, sendTemplate } from "./whatsapp";

type Result = Record<string, number | string>;
type Job = { name: string; label: string; run: (orgId: string, today: string) => Promise<Result> };

const EXPIRY_KEY: Record<number, string> = { 7: "exp7", 3: "exp3", 1: "exp1", 0: "expired" };

/** Members who can get reminders: not deleted, not suspended, not the walk-in customer. */
const reachable = (orgId: string) => db.member.findMany({ where: { orgId, deletedAt: null, walkIn: false, suspended: false }, select: { id: true, dob: true } });

export const JOBS: Job[] = [
  {
    name: "members.risk",
    label: "Churn risk for every member",
    run: (orgId, today) => computeRisk(orgId, today),
  },
  {
    name: "attendance.close",
    label: "Check out visits left open on earlier days",
    async run(orgId, today) {
      const open = await db.attendance.findMany({ where: { branch: { orgId }, checkOut: null, date: { lt: fromIso(today) } }, select: { id: true, date: true } });
      for (const a of open) await db.attendance.update({ where: { id: a.id }, data: { checkOut: istInstant(toIso(a.date), "22:00"), autoOut: true } });
      return { closed: open.length };
    },
  },
  {
    name: "reminders.expiry",
    label: "Expiry reminders on WhatsApp",
    async run(orgId, today) {
      const s = await getWaSettings(orgId);
      const members = await reachable(orgId);
      const sums = await summarize(members.map((m) => m.id), today);
      const onAutopay = new Set((await db.autopayMandate.findMany({ where: { orgId, status: "Active" }, select: { memberId: true } })).map((m) => m.memberId));
      let sent = 0;
      for (const m of members) {
        const end = sums.get(m.id)?.latestEnd;
        if (!end || onAutopay.has(m.id)) continue;
        const left = daysBetween(end, today);
        const key = s.expiryDays.includes(left) ? EXPIRY_KEY[left] : undefined;
        if (!key) continue;
        if (await sendTemplate({ orgId, memberId: m.id, key, auto: true })) sent++;
      }
      return { sent };
    },
  },
  {
    name: "reminders.dues",
    label: "Payment reminders on WhatsApp",
    async run(orgId, today) {
      const s = await getWaSettings(orgId);
      if (!s.dueEveryDays) return { sent: 0, note: "off" };
      const invoices = await db.invoice.findMany({
        where: { orgId, status: "ISSUED", dueDate: { lt: fromIso(today) }, member: { deletedAt: null, walkIn: false, suspended: false } },
        orderBy: { dueDate: "asc" },
        include: { payments: { select: { amount: true, status: true } } },
      });
      const oldest = new Map<string, { number: string; balance: number }>();
      for (const inv of invoices) {
        const st = invoiceState({ total: inv.total, cancelled: false, dueDate: toIso(inv.dueDate) }, inv.payments as { amount: number; status: "SUCCESS" | "REVERSED" }[], today);
        if (st.balance > 0 && !oldest.has(inv.memberId)) oldest.set(inv.memberId, { number: inv.number, balance: st.balance });
      }
      const since = new Date(Date.now() - s.dueEveryDays * 86_400_000 + 3_600_000);
      let sent = 0;
      for (const [memberId, inv] of oldest) {
        const recent = await db.whatsAppMessage.findFirst({ where: { memberId, templateKey: "due", sentAt: { gte: since }, status: { not: "Failed" } } });
        if (recent) continue;
        if (await sendTemplate({ orgId, memberId, key: "due", auto: true, force: true, vars: { invoice_number: inv.number } })) sent++;
      }
      return { sent, withDues: oldest.size };
    },
  },
  {
    name: "reminders.birthday",
    label: "Birthday wishes",
    async run(orgId, today) {
      const s = await getWaSettings(orgId);
      if (!s.birthdays) return { sent: 0, note: "off" };
      const md = today.slice(5);
      let sent = 0;
      for (const m of await reachable(orgId)) {
        if (m.dob && toIso(m.dob).slice(5) === md && (await sendTemplate({ orgId, memberId: m.id, key: "birthday", auto: true }))) sent++;
      }
      return { sent };
    },
  },
  {
    name: "reminders.winback",
    label: "Win-back offers to members who stopped coming",
    async run(orgId, today) {
      // Active members with no visit in 14 days, at most once a month (prototype's win-back rule; off until switched on).
      const members = await reachable(orgId);
      const sums = await summarize(members.map((m) => m.id), today);
      const active = members.filter((m) => (sums.get(m.id)?.latestEnd ?? "") >= today).map((m) => m.id);
      const seen = new Set((await db.attendance.findMany({ where: { memberId: { in: active }, date: { gte: fromIso(addDays(today, -14)) } }, select: { memberId: true }, distinct: ["memberId"] })).map((a) => a.memberId));
      const since = new Date(Date.now() - 30 * 86_400_000);
      let sent = 0;
      for (const id of active.filter((x) => !seen.has(x))) {
        if (await db.whatsAppMessage.findFirst({ where: { memberId: id, templateKey: "winback", sentAt: { gte: since }, status: { not: "Failed" } } })) continue;
        if (await sendTemplate({ orgId, memberId: id, key: "winback", auto: true, force: true })) sent++;
      }
      return { sent };
    },
  },
  {
    name: "autopay",
    label: "UPI Autopay notices and demo debits",
    run: (orgId, today) => runAutopayDay(orgId, today),
  },
  {
    name: "leads.followup",
    label: "Lead follow-ups due",
    async run(orgId, today) {
      const due = await db.lead.groupBy({ by: ["branchId"], where: { orgId, stage: { notIn: ["Won", "Lost"] }, followUpOn: { lte: fromIso(today) } }, _count: { _all: true } });
      for (const b of due) {
        await db.$transaction((tx) => notify(tx, { orgId, branchId: b.branchId, type: "LEAD_FOLLOW_UP", text: `${b._count._all} lead${b._count._all === 1 ? "" : "s"} to follow up today.`, link: "/leads?due=1" }));
      }
      return { branches: due.length, leads: due.reduce((a, b) => a + b._count._all, 0) };
    },
  },
  {
    name: "devices.sync",
    label: "Load members onto door devices, remove expired ones",
    run: (orgId, today) => syncDevices(orgId, today),
  },
  {
    name: "billing.branches",
    label: "Extra-branch plan reminders",
    run: (orgId, today) => billingReminders(orgId, today),
  },
  {
    name: "whatsapp.refresh",
    label: "Delivery status from the linked phone",
    run: async (orgId) => ({ updated: await refreshQueued(orgId) }),
  },
];

/**
 * Runs every daily job for one gym. Each job runs at most once per gym per day (JobRun is unique
 * on org + job + day); a job that failed is retried on the next call.
 */
export async function runDailyJobs(orgId: string, today = todayIso()) {
  const out: { name: string; status: "ran" | "skipped" | "failed"; result?: Result; error?: string }[] = [];
  for (const job of JOBS) {
    let run;
    try {
      run = await db.jobRun.create({ data: { orgId, name: job.name, day: today } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const prev = await db.jobRun.findUniqueOrThrow({ where: { orgId_name_day: { orgId, name: job.name, day: today } } });
      if (!prev.error) {
        out.push({ name: job.name, status: "skipped" });
        continue;
      }
      run = await db.jobRun.update({ where: { id: prev.id }, data: { startedAt: new Date(), error: null, finishedAt: null } });
    }
    try {
      const result = await job.run(orgId, today);
      await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), result: result as Prisma.InputJsonValue } });
      out.push({ name: job.name, status: "ran", result });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await db.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), error } });
      await db.$transaction((tx) => notify(tx, { orgId, type: "JOB_FAILED", text: `Daily job "${job.label}" failed: ${error}`, link: "/settings/jobs" }));
      out.push({ name: job.name, status: "failed", error });
    }
  }
  return out;
}

export async function runAllGyms(today = todayIso()) {
  const orgs = await db.organization.findMany({ select: { id: true, name: true } });
  const results = [];
  for (const o of orgs) results.push({ org: o.name, jobs: await runDailyJobs(o.id, today) });
  return results;
}

export const recentRuns = (orgId: string) => db.jobRun.findMany({ where: { orgId }, orderBy: { startedAt: "desc" }, take: 60 });

