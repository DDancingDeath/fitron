import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next";
import { GOOGLE_BACK, GOOGLE_FLOW_COOKIE, GOOGLE_SIGNUP_COOKIE, exchangeCode, sign, unsign, type GoogleFlow, type GoogleProfile } from "@/lib/integrations/google";
import { appUrl } from "@/lib/services/accounts";

// Google sends the visitor back here. The state must match the one we set in /auth/google,
// and the code is redeemed with our PKCE verifier, so a forged or replayed callback goes nowhere.

type Flow = { state: string; verifier: string; flow: GoogleFlow; next: string; plan: string; cycle: string };

const to = (path: string) => NextResponse.redirect(new URL(path, appUrl()));
const cookie = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const f = unsign<Flow>(req.cookies.get(GOOGLE_FLOW_COOKIE)?.value);
  const done = (res: NextResponse) => {
    res.cookies.set(GOOGLE_FLOW_COOKIE, "", { path: "/auth/google", maxAge: 0 });
    return res;
  };
  if (!f) return done(to("/login?google=expired"));
  const back = GOOGLE_BACK[f.flow];
  // Cancelled on Google's screen, or a state that isn't ours.
  if (q.get("error") || !q.get("code") || q.get("state") !== f.state) return done(to(`${back}?google=cancelled`));

  let me: GoogleProfile;
  try {
    me = await exchangeCode(q.get("code")!, f.verifier, `${appUrl()}/auth/google/callback`);
  } catch (e) {
    console.error("[google] sign-in failed:", e);
    return done(to(`${back}?google=failed`));
  }

  if (f.flow === "signup") {
    // An existing staff account just signs in; a new email goes on to the gym sign-up form.
    const user = await db.user.findFirst({ where: { email: me.email, active: true, deletedAt: null } });
    if (user) return done(await staffIn(user.id, user.emailVerifiedAt, "/dashboard"));
    const res = to(`/signup?${new URLSearchParams({ google: "1", ...(f.plan ? { plan: f.plan } : {}), ...(f.cycle ? { cycle: f.cycle } : {}) })}`);
    res.cookies.set(GOOGLE_SIGNUP_COOKIE, sign({ email: me.email, name: me.name }, 30 * 60_000), { ...cookie, maxAge: 1800 });
    return done(res);
  }

  const user = await db.user.findFirst({ where: { email: me.email, active: true, deletedAt: null } });
  if (!user) return done(to(`/login?google=nouser&email=${encodeURIComponent(me.email)}`));
  return done(await staffIn(user.id, user.emailVerifiedAt, safeNext(f.next)));
}

/** Google has verified the email, so an unconfirmed account counts as confirmed now. */
async function staffIn(userId: string, verifiedAt: Date | null, next: string) {
  await createSession(userId);
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), ...(verifiedAt ? {} : { emailVerifiedAt: new Date() }) } });
  return to(next);
}
