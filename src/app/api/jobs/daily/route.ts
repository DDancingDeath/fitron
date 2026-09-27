import { timingSafeEqual } from "node:crypto";
import { runAllGyms } from "@/lib/services/jobs";

// Daily jobs for every gym. Call it once a day around 06:30 IST (Vercel Cron, GitHub Actions,
// or any scheduler) with "Authorization: Bearer $CRON_SECRET". Calling it again the same day is harmless.
export const maxDuration = 300;

function authorised(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorised(req)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const day = new URL(req.url).searchParams.get("day") ?? undefined;
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return Response.json({ error: "day must be YYYY-MM-DD" }, { status: 400 });
  return Response.json({ ok: true, results: await runAllGyms(day) });
}

export const GET = handle;
export const POST = handle;
