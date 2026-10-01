import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: send visitors without a session cookie to sign-in.
// Real checks happen on the server in every page and action.
export function proxy(req: NextRequest) {
  // The home page is the public marketing site.
  if (req.nextUrl.pathname === "/") return NextResponse.next();
  if (!req.cookies.has("fitron_session")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // The website is public: /site (static home page files), sign-up, contact, policies, robots and sitemap.
  // Webhooks, the job runner and door devices (/iclock) authenticate with their own signatures and secrets.
  matcher: ["/((?!login|signup|contact|privacy|terms|refund|robots.txt|sitemap.xml|site/|_next/|favicon.ico|fitron-mark.png|api/health|api/webhooks/|api/jobs/|iclock/).*)"],
};
