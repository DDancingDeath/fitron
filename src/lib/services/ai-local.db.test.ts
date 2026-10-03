import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hasDb, makeGym, pick } from "@/test/db";
import { createMember } from "./members";
import { createInvoice } from "./billing";
import { aiBrief, localChat } from "./ai-local";
import type { ChatEvent } from "./ai";
import { todayIso } from "./time";

const run = async (gen: AsyncGenerator<ChatEvent>) => {
  const out: ChatEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
};

describe.skipIf(!hasDb)("Fitron AI without a model (database)", () => {
  let admin: Awaited<ReturnType<Awaited<ReturnType<typeof makeGym>>["user"]>>;
  let owingId: string;
  const today = todayIso();

  beforeAll(async () => {
    const gym = await makeGym();
    admin = pick(await gym.user("Super Admin"), gym.a.id);
    const m = await createMember(admin, { name: "Dues Member", gender: "Male", phone: "9877700001", source: "Walk-in", tags: [] });
    owingId = m.id;
    await createInvoice(admin, { memberId: m.id, date: today, dueDate: today, lines: [{ description: "PT", category: "Personal Training", qty: 1, rate: 100000, discount: 0, taxable: true }], payAmount: 0 });
    const r = await createMember(admin, { name: "Risky Member", gender: "Female", phone: "9877700002", source: "Walk-in", tags: [] });
    await db.member.update({ where: { id: r.id }, data: { riskScore: 80, riskReasons: ["No visits recorded"] } });
  });

  it("answers about dues and drafts a reminder that waits for Send", async () => {
    const ev = await run(localChat(admin, "Draft reminders for pending dues"));
    const text = ev.find((e) => e.type === "text");
    expect(text && "text" in text && text.text).toMatch(/₹1,180 is outstanding across 1 members/);
    const p = ev.find((e) => e.type === "proposal");
    expect(p).toBeDefined();
    const row = await db.aiProposal.findUniqueOrThrow({ where: { id: (p as { id: string }).id } });
    expect(row).toMatchObject({ status: "PENDING", memberIds: [owingId] });
  });

  it("lists members at risk with their reasons", async () => {
    const ev = await run(localChat(admin, "Which members are at risk?"));
    const text = ev.find((e) => e.type === "text") as { text: string };
    expect(text.text).toContain("Risky Member");
    expect(text.text).toContain("no visits recorded");
  });

  it("falls back to today's overview, and the brief counts the same things", async () => {
    const ev = await run(localChat(admin, "hello"));
    expect((ev.find((e) => e.type === "text") as { text: string }).text).toMatch(/₹1,180 outstanding and 1 members at risk/);
    const brief = await aiBrief(admin);
    expect(brief.find((b) => b.icon === "risk")?.title).toBe("1 members at risk of not renewing");
    expect(brief.find((b) => b.icon === "money")?.title).toBe("₹1,180 to collect");
  });
});
