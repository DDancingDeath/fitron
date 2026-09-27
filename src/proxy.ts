import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: send visitors without a session cookie to sign-in.
// Real checks happen on the server in every page and action.
export function proxy(req: NextRequest) {
  if (!req.cookies.has("fitron_session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Webhooks, the job runner and door devices (/iclock) authenticate with their own signatures and secrets.
  matcher: ["/((?!login|_next/|favicon.ico|fitron-mark.png|api/health|api/webhooks/|api/jobs/|iclock/).*)"],
};
