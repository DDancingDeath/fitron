import { NextResponse, type NextRequest } from "next/server";
import { redeemTrainerLink } from "@/lib/services/trainer";
import { createTrainerSession } from "@/lib/services/trainer-session";

/** The link from the sign-in email: signs in (creating the account the first time) and opens the app. */
export async function GET(req: NextRequest) {
  const member = await redeemTrainerLink(req.nextUrl.searchParams.get("token") ?? "");
  if (!member) return NextResponse.redirect(new URL("/trainer?link=expired", req.url));
  await createTrainerSession(member.id);
  return NextResponse.redirect(new URL("/trainer", req.url));
}
