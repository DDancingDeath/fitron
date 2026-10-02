import { loadTrainer, memberView, saveTrainerState, type DayInput } from "@/lib/services/trainer";
import { db } from "@/lib/db";
import { body, json, withTrainer } from "../_lib/http";

/** Save what changed: app state (profile), today's log (day), and account flags. */
export async function PUT(req: Request) {
  return withTrainer(async (m) => {
    const b = await body<{ profile?: unknown; day?: DayInput; onboarded?: boolean; consented?: boolean; plan?: string; cycle?: string; full?: boolean }>(req);
    await saveTrainerState(m.id, b);
    if (b.full) return json(await loadTrainer(m.id));
    return json({ ok: true, member: memberView(await db.trainerMember.findUniqueOrThrow({ where: { id: m.id } })) });
  });
}
