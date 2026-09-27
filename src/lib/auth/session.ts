import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "fitron_session";
const SESSION_DAYS = 30;
/** Sign out after this long without a request (HANDOFF: idle sign-out, default 30 min). */
export const IDLE_MINUTES = 30;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  // Rotate: a fresh id on every sign-in.
  await db.session.create({
    data: {
      id: sha256(token),
      userId,
      expiresAt,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent"),
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Returns the signed-in user's session row, or null. Expired and idle sessions are removed. */
export async function readSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = sha256(token);
  const session = await db.session.findUnique({ where: { id } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() < now || now - session.lastSeenAt.getTime() > IDLE_MINUTES * 60_000) {
    await db.session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  // Touch at most once a minute.
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await db.session.update({ where: { id }, data: { lastSeenAt: new Date(now) } }).catch(() => {});
  }
  return session;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.delete({ where: { id: sha256(token) } }).catch(() => {});
  store.delete(SESSION_COOKIE);
}
