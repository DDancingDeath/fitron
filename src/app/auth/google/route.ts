import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_BACK, GOOGLE_FLOWS, GOOGLE_FLOW_COOKIE, authUrl, googleReady, newPkce, sign, type GoogleFlow } from "@/lib/integrations/google";
import { appUrl } from "@/lib/services/accounts";
import { safeNext } from "@/lib/auth/next";

// Starts "Continue with Google". ?for=staff (console login) or signup (new gym).


export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const flow: GoogleFlow = (GOOGLE_FLOWS as readonly string[]).includes(q.get("for") ?? "") ? (q.get("for") as GoogleFlow) : "staff";
  const next = safeNext(q.get("next"), "");
  const plan = q.get("plan") ?? "";
  const cycle = q.get("cycle") ?? "";
  if (!googleReady()) return NextResponse.redirect(new URL(`${GOOGLE_BACK[flow]}?google=off`, appUrl()));

  const { verifier, challenge, state } = newPkce();
  const res = NextResponse.redirect(authUrl({ redirectUri: `${appUrl()}/auth/google/callback`, state, challenge }));
  res.cookies.set(GOOGLE_FLOW_COOKIE, sign({ state, verifier, flow, next, plan, cycle }, 10 * 60_000), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/google",
    maxAge: 600,
  });
  return res;
}
