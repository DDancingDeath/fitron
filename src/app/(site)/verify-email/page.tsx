import { redirect } from "next/navigation";
import { EmailForm } from "../email-form";
import { resendLink } from "../account-actions";
import { verifyEmail } from "@/lib/services/accounts";

export const metadata = { title: "Confirm your email · FITRON" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const q = await searchParams;
  const token = typeof q.token === "string" ? q.token : "";
  if (token && (await verifyEmail(token))) redirect("/login?verified=1");
  const sent = typeof q.sent === "string" ? q.sent : "";
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-4xl font-semibold">{token ? "That link didn't work" : "Check your email"}</h1>
      <p className="mt-4 mb-8 text-lg text-muted">
        {token
          ? "It has expired or was already used. Send yourself a new one."
          : `We sent a link to ${sent || "your email"}. Open it to confirm your address, then sign in. It can take a minute; check spam too.`}
      </p>
      <EmailForm action={resendLink} email={sent} label="Send a new link" />
      <p className="mt-8 text-sm text-muted">
        Already confirmed? <a href="/login" className="text-accent underline">Sign in</a>
      </p>
    </div>
  );
}
