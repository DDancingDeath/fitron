import { Logo } from "@/components/logo";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { LoginForm } from "./login-form";
import { Notice } from "@/components/ui";
import { safeNext } from "@/lib/auth/next";
import { GoogleButton, googleMessage } from "@/components/google-button";

export const metadata = { title: "Log in · FITRON" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const q = await searchParams;
  const next = safeNext(q.next, "");
  if (await getCurrentUser()) redirect(next || "/dashboard");
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[radial-gradient(ellipse_at_top_left,var(--accent-soft),transparent_60%)] p-12 lg:flex">
        <a href="/"><Logo size={56} /></a>
        <div>
          <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-accent uppercase">Fitron gym accounting solution</p>
          <h1 className="text-5xl leading-tight font-semibold">Run your gym on Fitron.</h1>
          <p className="mt-4 max-w-md text-lg text-muted">
            Members, payments, WhatsApp reminders and accounting in one console for the front desk and the owner.
          </p>
        </div>
        <p className="text-sm text-muted">Need help? hello@fitron.in</p>
      </section>
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><a href="/"><Logo /></a></div>
          <h2 className="text-3xl font-semibold">Log in</h2>
          <p className="mt-1 mb-6 text-muted">Use Google, or your email and password.</p>
          {q.reset && <div className="mb-4"><Notice tone="ok">Password changed. Log in with your new password.</Notice></div>}
          {q.verified && <div className="mb-4"><Notice tone="ok">Email confirmed. Log in to open your console.</Notice></div>}
          {googleMessage(q.google, q.email) && <div className="mb-4"><Notice tone="alert">{googleMessage(q.google, q.email)}</Notice></div>}
          <div className="mb-4 flex flex-col gap-4">
            <GoogleButton href={`/auth/google?${new URLSearchParams({ for: "staff", ...(next ? { next } : {}) })}`} />
          </div>
          <LoginForm next={next} />
          <p className="mt-8 text-center text-sm text-muted">
            New to FITRON? <a href="/signup" className="text-accent underline">Start a free trial</a>
          </p>
        </div>
      </section>
    </main>
  );
}
