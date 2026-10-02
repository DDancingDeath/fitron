import { submitTrainerUtr } from "@/lib/services/trainer";
import { body, json, withTrainer } from "../../../_lib/http";

/** The member paid and typed the 12-digit UTR; FITRON checks it before the plan turns on. */
export async function POST(req: Request, ctx: RouteContext<"/api/trainer/pay/[id]/utr">) {
  const { id } = await ctx.params;
  return withTrainer(async (m) => {
    const { utr } = await body<{ utr?: string }>(req);
    return json({ payment: await submitTrainerUtr(m.id, id, String(utr ?? "")) });
  });
}
