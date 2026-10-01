import { ContactForm } from "./contact-form";
import { TOPICS } from "@/lib/validation/site";

export const metadata = { title: "Contact · FITRON", description: "Talk to FITRON: sales, demos, gym partnerships and support." };

export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  const q = await searchParams;
  const topic = typeof q.topic === "string" && q.topic in TOPICS ? q.topic : "general";
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,32rem)]">
      <section>
        <h1 className="text-4xl font-semibold sm:text-5xl">Talk to us</h1>
        <p className="mt-4 max-w-md text-lg text-muted">Questions, a demo of Gym Accounting, a partnership for your gym, or help with your account. We reply within one working day.</p>
        <dl className="mt-8 flex flex-col gap-4">
          <div>
            <dt className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">WhatsApp</dt>
            <dd><a href="https://wa.me/916207774673" target="_blank" rel="noopener" className="text-lg underline">+91 62077 74673</a></dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">Email</dt>
            <dd><a href="mailto:hello@fitron.in" className="text-lg underline">hello@fitron.in</a></dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">Hours</dt>
            <dd className="text-lg">Monday to Saturday, 10 am to 6 pm IST</dd>
          </div>
        </dl>
      </section>
      <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
        <ContactForm topic={topic} />
      </section>
    </div>
  );
}
