import "server-only";
import type { TrainerMember } from "@/generated/prisma/client";
import { UserError } from "@/lib/services/errors";
import { currentTrainer } from "@/lib/services/trainer-session";

// Shared bits of the AI Trainer API routes: who is signed in, JSON bodies, and errors as JSON.

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  const b = await req.json().catch(() => null);
  return (b && typeof b === "object" ? b : {}) as T;
}

/** Runs `fn` for the signed-in member; 401 without a session, 400 with the message for a UserError. */
export async function withTrainer(fn: (m: TrainerMember) => Promise<Response>) {
  const m = await currentTrainer();
  if (!m) return json({ error: "Sign in again." }, 401);
  try {
    return await fn(m);
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400);
    console.error("[trainer api]", e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
}
