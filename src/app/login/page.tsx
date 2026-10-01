import { Logo } from "@/components/logo";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Fitron" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[radial-gradient(ellipse_at_top_left,var(--accent-soft),transparent_60%)] p-12 lg:flex">
        <Logo size={56} />
        <div>
          <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-accent uppercase">Fitron gym accounting solution</p>
          <h1 className="text-5xl leading-tight font-semibold">Run your gym on Fitron.</h1>
          <p className="mt-4 max-w-md text-lg text-muted">
            Members, payments, WhatsApp reminders and accounting in one console for the front desk and the owner.
          </p>
        </div>
        <p className="text-sm text-muted">Need help? support@fitron.in</p>
      </section>
      <section className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h2 className="text-3xl font-semibold">Sign in</h2>
          <p className="mt-1 mb-8 text-muted">Use your staff email and password.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
