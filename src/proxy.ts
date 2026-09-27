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
  matcher: ["/((?!login|_next/|favicon.ico|fitron-mark.png|api/health).*)"],
};
