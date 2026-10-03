import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hasDb, makeGym, pick } from "@/test/db";
import { addDays } from "@/lib/domain/dates";
import { createMember } from "./members";
import { createPlan } from "./plans";
import { createInvoice, sellMembership } from "./billing";
import { automationPreview, ruleText, runAutomationNow } from "./wa-automation";
import { DEFAULT_WA, listTemplates, updateTemplate } from "./whatsapp";
import { todayIso } from "./time";

describe.skipIf(!hasDb)("WhatsApp automation (database)", () => {
  let admin: Awaited<ReturnType<Awaited<ReturnType<typeof makeGym>>["user"]>>;
  const today = todayIso();

  beforeAll(async () => {
    const gym = await makeGym();
    admin = pick(await gym.user("Super Admin"), gym.a.id);
    const planId = (await createPlan(admin, { name: "Monthly", kind: "Membership", months: 1, price: 100000, regFee: 0, discount: 0, gstApplicable: true, features: [] })).id;
    // An overdue balance (payment reminder) on an active member who hasn't visited (win-back).
    const m = await createMember(admin, { name: "Away Member", gender: "Male", phone: "9888800001", source: "Walk-in", tags: [] });
    await sellMembership(admin, m.id, { planId, startDate: today, discount: 0, includeRegFee: false, payAmount: 118000, payMethod: "Cash" });
    await createInvoice(admin, { memberId: m.id, date: addDays(today, -10), dueDate: addDays(today, -5), lines: [{ description: "PT", category: "Personal Training", qty: 1, rate: 50000, discount: 0, taxable: false }], payAmount: 0 });
  });

  it("previews what the daily rules will send, and win-back only once it's switched on", async () => {
    let rows = await automationPreview(admin);
    expect(rows.find((r) => r.key === "due")).toEqual({ key: "due", send: 1, skipped: 0 });
    expect(rows.find((r) => r.key === "winback")).toBeUndefined();
    const t = (await listTemplates(admin.orgId)).find((x) => x.key === "winback")!;
    await updateTemplate(admin, "winback", { body: t.body, language: t.language, autoSend: true });
    rows = await automationPreview(admin);
    expect(rows.find((r) => r.key === "winback")).toEqual({ key: "winback", send: 1, skipped: 0 });
  });

  it("Send due now sends them, and the no-repeat windows turn them into skips", async () => {
    expect(await runAutomationNow(admin)).toBe(2);
    const keys = (await db.whatsAppMessage.findMany({ where: { orgId: admin.orgId }, select: { templateKey: true } })).map((m) => m.templateKey).sort();
    expect(keys).toContain("due");
    expect(keys).toContain("winback");
    const rows = await automationPreview(admin);
    expect(rows.find((r) => r.key === "due")).toEqual({ key: "due", send: 0, skipped: 1 });
    expect(rows.find((r) => r.key === "winback")).toEqual({ key: "winback", send: 0, skipped: 1 });
    expect(await runAutomationNow(admin)).toBe(0);
  });

  it("describes each rule in words", () => {
    expect(ruleText("exp3", "", DEFAULT_WA)).toMatch(/3 days before expiry/);
    expect(ruleText("due", "", { ...DEFAULT_WA, dueEveryDays: 0 })).toMatch(/^Off/);
    expect(ruleText("welcome", "New membership sold", DEFAULT_WA)).toBe("When it happens · New membership sold");
  });
});
