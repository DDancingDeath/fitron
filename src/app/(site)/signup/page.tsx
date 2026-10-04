import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TrialForm } from "./trial-form";
import { GoogleButton, googleMessage } from "@/components/google-button";
import { Notice } from "@/components/ui";
import { GOOGLE_SIGNUP_COOKIE, unsign } from "@/lib/integrations/google";
import { GymSignupForm } from "./gym-signup-form";
import { DEFAULT_PLAN, PRODUCT_LABEL, findPlan, rupeesLabel } from "@/lib/domain/pricing";

export const metadata = { title: "Start your free trial · FITRON", description: "Start a 7-day free trial of FITRON AI Trainer or Gym Accounting. No card needed." };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const q = await searchParams;
  const plan = findPlan(typeof q.plan === "string" ? q.plan : null) ?? findPlan(DEFAULT_PLAN)!;
  const cycle = q.cycle === "YEARLY" || q.cycle === "year" ? "YEARLY" : "MONTHLY";
  // AI Trainer plans sign up inside the member app itself (email link or Google), with the plan picked.
  if (plan.product === "AI_TRAINER") redirect(`/trainer?plan=${plan.key}`);
  // Gym plans get a real account straight away; AI Trainer and partner plans are set up with the team.
  const gym = plan.product === "GYM_ACCOUNTING";
  // Back from Google: the verified email and name fill the form.
  const google = gym ? unsign<{ email: string; name: string }>((await cookies()).get(GOOGLE_SIGNUP_COOKIE)?.value) : null;
  const problem = googleMessage(q.google);
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,26rem)]">
      <section>
        <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-accent uppercase">
          {plan.trialDays ? `${plan.trialDays}-day free trial · no card needed` : "Gym partnership"}
        </p>
        <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">
          {PRODUCT_LABEL[plan.product]} {plan.name}
        </h1>
        <p className="mt-4 max-w-lg text-lg text-muted">{plan.tagline}</p>
        <p className="mt-6 text-2xl font-semibold">
          {rupeesLabel(plan.price.MONTHLY)} <span className="text-base font-normal text-muted">/ month, or {rupeesLabel(plan.price.YEARLY)} / year, plus GST</span>
        </p>
        {gym ? (
          <ol className="mt-8 flex max-w-lg flex-col gap-3 text-muted">
            <li><b className="text-fg">1.</b> Create your account. It takes a minute.</li>
            <li><b className="text-fg">2.</b> Confirm your email, then add your plans and members, or import them from Excel.</li>
            <li><b className="text-fg">3.</b> Use everything free for 7 days. Pay by UPI only if you want to continue: nothing auto-debits.</li>
          </ol>
        ) : (
          <ol className="mt-8 flex max-w-lg flex-col gap-3 text-muted">
            <li><b className="text-fg">1.</b> Send this form. It takes a minute.</li>
            <li><b className="text-fg">2.</b> We call or WhatsApp you within one working day and set up your account.</li>
            <li><b className="text-fg">3.</b> {plan.trialDays ? "Use everything free for 7 days. Pay by UPI only if you want to continue: nothing auto-debits." : "Sign the partnership agreement and go live."}</li>
          </ol>
        )}
        <p className="mt-8 text-sm text-muted">
          Already have an account? <a href="/login" className="text-accent underline">Sign in</a>
        </p>
      </section>
      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        {gym ? (
          <div className="flex flex-col gap-4">
            {problem && <Notice tone="alert">{problem}</Notice>}
            {!google && <GoogleButton href={`/auth/google?${new URLSearchParams({ for: "signup", plan: plan.key, cycle })}`} label="Sign up with Google" />}
            <GymSignupForm plan={plan.key} cycle={cycle} google={google ? { email: google.email, name: google.name } : undefined} />
          </div>
        ) : (
          <TrialForm plan={plan.key} cycle={cycle} />
        )}
      </section>
    </div>
  );
}
