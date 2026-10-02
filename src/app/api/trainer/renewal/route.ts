import { memberView, setTrainerRenewal } from "@/lib/services/trainer";
import { body, json, withTrainer } from "../_lib/http";

/** Stop (or resume) renewal. Nothing auto-debits; this only records the member's choice. */
export async function POST(req: Request) {
  return withTrainer(async (m) => {
    const { cancelled } = await body<{ cancelled?: boolean }>(req);
    return json({ member: memberView(await setTrainerRenewal(m.id, cancelled !== false)) });
  });
}
