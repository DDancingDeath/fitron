import "server-only";
import type { TrainerMember } from "@/generated/prisma/client";
import { claudeText } from "@/lib/integrations/anthropic";
import { todayIso } from "./time";

// The AI Coach in the member app. One plain reply per message, grounded in what the member
// told the app at onboarding (saved on their account) plus the targets the app worked out.

export type CoachTurn = { role: "user" | "assistant"; text: string };

const FIELDS: [string, string][] = [
  ["name", "Name"], ["age", "Age"], ["sex", "Sex"], ["height", "Height (cm)"], ["weight", "Weight (kg)"],
  ["goal", "Main goal"], ["extras", "Also wants"], ["trainNow", "Trains now"], ["dayLike", "Their day"],
  ["injuries", "Injuries"], ["injuryNote", "Injury note"], ["days", "Training days"], ["session", "Session length"],
  ["trainAt", "Trains at"], ["wake", "Wakes"], ["sleep", "Sleeps"], ["equipment", "Equipment"], ["gymName", "Gym"],
  ["diet", "Diet"], ["cuisines", "Cuisines"], ["avoid", "Avoids"], ["mealsDay", "Meals a day"], ["cooks", "Who cooks"],
  ["city", "City"], ["state", "State"], ["budget", "Monthly food budget"], ["supps", "Supplements"], ["suppDetail", "Supplement detail"],
  ["split", "Weekly split"], ["todayFocus", "Today's focus"], ["schedule", "Day schedule"],
  ["kcal", "Calorie target (kcal/day)"], ["protein", "Protein target (g/day)"], ["water", "Water goal (L/day)"],
];

const val = (v: unknown) => (Array.isArray(v) ? v.map(String).join(", ") : v == null ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, 300);

/** The member's profile as prompt lines: saved onboarding answers win over what the app sent. */
export function profileLines(saved: Record<string, unknown>, sent: Record<string, unknown>) {
  const ob = (saved.ob ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...sent, ...Object.fromEntries(Object.entries(ob).filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && !v.length))) };
  if (ob.exactTime || ob.timeOfDay) merged.trainAt = ob.exactTime || ob.timeOfDay;
  if (Array.isArray(ob.supps) || Array.isArray(ob.suppCustom)) merged.supps = [...((ob.supps as unknown[]) ?? []), ...((ob.suppCustom as unknown[]) ?? [])];
  return FIELDS.map(([k, label]) => [label, val(merged[k])] as const)
    .filter(([, v]) => v)
    .map(([label, v]) => `- ${label}: ${v}`);
}

export function coachSystem(m: Pick<TrainerMember, "name" | "plan">, lines: string[]) {
  return [
    "You are the FITRON AI Coach, a personal fitness and nutrition coach inside the FITRON AI Trainer app, for people in India.",
    `Today is ${todayIso()} (India time). The member is on the ${m.plan === "ai-premium" ? "AI Premium" : "AI Pro"} plan.`,
    "What the member told the app, and the targets it worked out:",
    ...(lines.length ? lines : ["- (nothing yet)"]),
    "",
    "Coach them like a good personal trainer: specific, encouraging, practical. Use their plan, schedule, diet, budget and city; suggest Indian foods they can buy locally.",
    "Keep replies short for a phone screen: a direct answer first, then at most 4 short bullet points. Plain text, no tables or headings.",
    "Respect injuries: suggest safe alternatives and tell them to see a doctor or physiotherapist for pain, swelling or anything that gets worse. Never diagnose or prescribe medicine.",
    "If they mention chest pain, fainting, eating-disorder signs or thoughts of self-harm, tell them kindly to get medical help now (India emergency number 112) and keep the rest brief.",
    "You can't see photos or videos; if they mention one, ask them to describe what they saw. You can't change their plan in the app; tell them where to change it (My Plan, Nutrition, Settings).",
    "Reply in the language they write in (English, Hindi or Hinglish).",
  ].join("\n");
}

/** Claude's reply to the latest message, given up to the last 12 turns. */
export async function coachAnswer(m: TrainerMember, turns: CoachTurn[], sentProfile: Record<string, unknown>) {
  const lines = profileLines((m.profile ?? {}) as Record<string, unknown>, sentProfile);
  // The API wants alternating turns that start with the member.
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of turns.slice(-12)) {
    const text = t.text.trim().slice(0, 4000);
    if (!text) continue;
    if (!msgs.length && t.role !== "user") continue;
    const last = msgs.at(-1);
    if (last && last.role === t.role) last.content += "\n\n" + text;
    else msgs.push({ role: t.role, content: text });
  }
  if (!msgs.length || msgs.at(-1)!.role !== "user") return "";
  return claudeText({ system: coachSystem(m, lines), messages: msgs, maxTokens: 700 });
}
