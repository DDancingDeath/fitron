import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { claude, type Block, type Msg } from "@/lib/integrations/anthropic";
import { runTool, TOOL_DEFS } from "./ai-tools";
import { UserError } from "./errors";
import { getSetting } from "./settings";
import { getAiSettings } from "./ai-settings";
import { sendCampaign } from "./whatsapp";
import { audit } from "./audit";
import { todayIso } from "./time";

export type ChatEvent = { type: "tool"; name: string } | { type: "text"; text: string } | { type: "proposal"; id: string; summary: string; members: number; body: string } | { type: "error"; message: string } | { type: "done" };

const TOOL_LABEL: Record<string, string> = {
  get_overview: "Looking at today's numbers",
  list_members: "Listing members",
  find_member: "Finding the member",
  revenue_breakdown: "Reading the accounts",
  class_and_attendance: "Checking attendance and classes",
  propose_action: "Drafting a message",
};
export const toolLabel = (n: string) => TOOL_LABEL[n] ?? n;

async function systemPrompt(u: CurrentUser) {
  const gym = (await getSetting<{ name?: string }>(u.orgId, "gym"))?.name ?? u.orgName;
  const { autoWinback } = await getAiSettings(u.orgId);
  const branch = u.branch === "ALL" ? "all branches" : (u.branches.find((b) => b.id === u.branch)?.name ?? "");
  return [
    `You are Fitron AI, the assistant inside Fitron, gym management software used by ${gym} in India.`,
    `You are talking to ${u.name}, whose role is ${u.role}, looking at ${branch}. Today is ${todayIso()} (India time).`,
    "Answer from the tools, never from guesses. If a tool says the user can't see something, say so plainly.",
    "Money is in Indian rupees; write amounts like ₹12,500. Keep answers short and practical: lead with the answer, then at most a few bullet points.",
    "You cannot change anything yourself. To message members, call propose_action; the user confirms before anything is sent. Never claim a message was sent.",
    "Reply in the language the user writes in (English, Hindi or Hinglish).",
    `Win-back suggestions are ${autoWinback ? "on: when members are at risk, offer to draft a win-back message via propose_action" : "off: do not propose win-back messages unless the user explicitly asks"}.`,
  ].join("\n");
}

/** One chat turn: calls Claude, runs the tools it asks for (up to 6 rounds), and reports progress. */
export async function* chat(u: CurrentUser, history: Msg[]): AsyncGenerator<ChatEvent> {
  const system = await systemPrompt(u);
  const messages: Msg[] = history.slice(-20);
  for (let round = 0; round < 6; round++) {
    const res = await claude({ system, messages, tools: TOOL_DEFS });
    const text = res.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("");
    if (text) yield { type: "text", text };
    const uses = res.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) {
      yield { type: "done" };
      return;
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Block[] = [];
    for (const t of uses) {
      yield { type: "tool", name: t.name };
      let out: unknown;
      try {
        out = await runTool(u, t.name, t.input ?? {});
      } catch (e) {
        out = { error: e instanceof UserError ? e.message : "The tool failed." };
      }
      if (t.name === "propose_action" && out && typeof out === "object" && "proposal_id" in out) {
        const p = await db.aiProposal.findUniqueOrThrow({ where: { id: String((out as { proposal_id: string }).proposal_id) } });
        yield { type: "proposal", id: p.id, summary: p.summary, members: p.memberIds.length, body: p.body };
      }
      results.push({ type: "tool_result", tool_use_id: t.id, content: JSON.stringify(out).slice(0, 30_000), is_error: !!(out && typeof out === "object" && "error" in out) });
    }
    messages.push({ role: "user", content: results });
  }
  yield { type: "text", text: "That needed more steps than I can take in one go. Try a narrower question." };
  yield { type: "done" };
}

/** Staff pressed Send on a suggestion: send it under their own name, through the normal WhatsApp path. */
export async function confirmProposal(u: CurrentUser, id: string) {
  const p = await db.aiProposal.findFirst({ where: { id, orgId: u.orgId, userId: u.id } });
  if (!p) throw new UserError("Suggestion not found.");
  if (p.status !== "PENDING") throw new UserError("Already handled.");
  if (!u.can("whatsapp.send")) throw new UserError("Your role can't send WhatsApp messages.");
  // Claim it first so a double-click can't send twice.
  const claimed = await db.aiProposal.updateMany({ where: { id, status: "PENDING" }, data: { status: "DONE", doneAt: new Date() } });
  if (!claimed.count) throw new UserError("Already handled.");
  const r = await sendCampaign(u, p.memberIds, p.body);
  const result = `${r.sent} sent${r.failed ? `, ${r.failed} failed` : ""}`;
  await db.aiProposal.update({ where: { id }, data: { result } });
  await db.$transaction((tx) => audit(tx, { orgId: u.orgId, userId: u.id, action: "ai.proposal.send", entity: "AiProposal", entityId: id, after: { summary: p.summary, result } }));
  return r;
}

export async function dismissProposal(u: CurrentUser, id: string) {
  await db.aiProposal.updateMany({ where: { id, orgId: u.orgId, userId: u.id, status: "PENDING" }, data: { status: "DISMISSED", doneAt: new Date() } });
}
