import { EmailForm } from "../email-form";
import { forgotPassword } from "../account-actions";

export const metadata = { title: "Forgot password · FITRON" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-4xl font-semibold">Forgot your password?</h1>
      <p className="mt-4 mb-8 text-lg text-muted">Enter your email and we&apos;ll send you a link to choose a new one.</p>
      <EmailForm action={forgotPassword} label="Send reset link" />
      <p className="mt-8 text-sm text-muted">
        Remembered it? <a href="/login" className="text-accent underline">Log in</a>
      </p>
    </div>
  );
}
