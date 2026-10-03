import { linkTrainerGym, unlinkTrainerGym } from "@/lib/services/trainer-gym";
import { body, json, withTrainer } from "../_lib/http";

/** Link to a gym on FITRON with its trainer code (Gym Partnership). */
export async function POST(req: Request) {
  return withTrainer(async (m) => {
    const b = await body<{ code?: string }>(req);
    return json({ gym: await linkTrainerGym(m.id, String(b.code ?? "")) });
  });
}

/** Leave the gym. */
export async function DELETE() {
  return withTrainer(async (m) => {
    await unlinkTrainerGym(m.id);
    return json({ gym: null });
  });
}
