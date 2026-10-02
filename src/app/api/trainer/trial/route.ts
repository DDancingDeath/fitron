import { memberView, startTrainerTrial } from "@/lib/services/trainer";
import { body, json, withTrainer } from "../_lib/http";

/** Start the 7-day free trial (once per account). */
export async function POST(req: Request) {
  return withTrainer(async (m) => {
    const { plan } = await body<{ plan?: string }>(req);
    return json({ member: memberView(await startTrainerTrial(m.id, plan)) });
  });
}
