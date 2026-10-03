import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { getGymProfile, getSetting } from "@/lib/services/settings";
import { getTax } from "@/lib/services/tax";
import { nextInvoiceNumber } from "@/lib/services/billing";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { gymLogoUrl } from "@/components/gym-logo";
import { LogoForm } from "./logo-form";
import { TaxForm } from "./tax-form";
import { SETTINGS_TABS, SectionTabs } from "@/components/section-tabs";
import { makeTrainerCode, saveAutopay, saveBranchAction, saveGym, saveNumbering, saveWhatsApp } from "./actions";
import { getWaSettings } from "@/lib/services/whatsapp";
import { getAutopayMode } from "@/lib/services/autopay";
import { providerStatus } from "@/lib/integrations/whatsapp";
import { razorpayReady } from "@/lib/integrations/razorpay";
import Link from "next/link";
import { appUrl } from "@/lib/services/accounts";
import { PARTNER_SHARE } from "@/lib/domain/pricing";

export const metadata = { title: "Settings · Fitron" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const u = await requirePermission("settings.manage");
  const sp = await searchParams;
  const section = typeof sp.section === "string" ? sp.section : typeof sp.saved === "string" ? sp.saved : undefined;
  const asked =
    typeof sp.tab === "string"
      ? sp.tab
      : (
          {
            gym: "gym",
            numbering: "gym",
            tax: "billing",
            whatsapp: "wa",
            autopay: "int",
            branches: "branches",
          } as Record<string, string>
        )[section ?? ""];
  const tab = ["gym", "billing", "wa", "int", "branches"].includes(asked ?? "") ? asked! : "gym";
  const [gym, tax, nextInvoice, numbering, branches, wa, autopayMode] = await Promise.all([
    getGymProfile(u.orgId),
    getTax(u.orgId),
    nextInvoiceNumber(u.orgId),
    getSetting<{
      memberPrefix?: string;
      invoicePrefix?: string;
      paymentPrefix?: string;
    }>(u.orgId, "numbering"),
    db.branch.findMany({
      where: { orgId: u.orgId },
      orderBy: { createdAt: "asc" },
    }),
    getWaSettings(u.orgId),
    getAutopayMode(u.orgId),
  ]);
  const waStatus = await providerStatus(wa.mode);
  const trainerCode = tab === "gym" ? (await db.organization.findUniqueOrThrow({ where: { id: u.orgId }, select: { trainerCode: true } })).trainerCode : null;
  const rzpMissing = razorpayReady();

  return (
    <div className="flex flex-col gap-7 pt-4">
      <div>
        <div className="text-[11px] tracking-[0.1em] text-muted uppercase">{u.role}</div>
        <h1 className="mt-1 text-[28px] lg:text-[40px]">Settings</h1>
      </div>
      <div className="-mb-7">
        <SectionTabs u={u} tabs={SETTINGS_TABS} current={tab === "gym" ? "/settings" : `/settings?tab=${tab}`} />
      </div>
      {typeof sp.saved === "string" && <Notice tone="ok">Saved. Changes are recorded in the audit log.</Notice>}
      {typeof sp.error === "string" && <Notice tone="alert">{sp.error}</Notice>}
      {tab === "gym" && (
        <div className="grid max-w-[960px] gap-10 lg:grid-cols-2">
          <Panel title="Gym profile" className="lg:col-span-2">
            <form action={saveGym} className="flex flex-col gap-[18px]">
              <div className="grid max-w-[900px] gap-x-6 gap-y-[18px] sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Gym name">
                  <Input name="name" defaultValue={gym.name} required maxLength={120} />
                </Field>
                <Field label="Tagline">
                  <Input name="tagline" defaultValue={gym.tagline ?? ""} placeholder="Built Stronger" maxLength={80} />
                </Field>
                <Field label="Address">
                  <Textarea name="address" defaultValue={gym.address ?? ""} rows={2} className="min-h-0! py-2" maxLength={300} />
                </Field>
                <Field label="State">
                  <Input name="state" defaultValue={gym.state ?? ""} placeholder="Jharkhand" maxLength={60} />
                </Field>
                <Field label="Phone">
                  <Input name="phone" type="tel" inputMode="numeric" defaultValue={gym.phone ?? ""} placeholder="10-digit mobile" />
                </Field>
                <Field label="Email">
                  <Input name="email" type="email" defaultValue={gym.email ?? ""} placeholder="hello@yourgym.in" maxLength={120} />
                </Field>
                <Field label="Website">
                  <Input name="website" defaultValue={gym.website ?? ""} placeholder="yourgym.in" maxLength={120} />
                </Field>
                <Field label="Instagram">
                  <Input name="instagram" defaultValue={gym.instagram ?? ""} placeholder="@yourgym" maxLength={80} />
                </Field>
              </div>
              <div>
                <Button variant="primary">Save</Button>
              </div>
              <p className="text-xs text-muted">
                Saved changes are recorded in the audit log. The name, address and GSTIN print on every invoice; the name is also used in WhatsApp messages and Fitron AI.
              </p>
            </form>
            <LogoForm logoSrc={gymLogoUrl(gym.logoKey)} hasLogo={!!gym.logoKey} />
          </Panel>
          <Panel title="Numbering">
            <form action={saveNumbering} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Member ID prefix">
                  <Input name="memberPrefix" defaultValue={numbering?.memberPrefix ?? "FT-"} />
                </Field>
                <Field label="Invoice prefix">
                  <Input name="invoicePrefix" defaultValue={numbering?.invoicePrefix ?? "INV-"} />
                </Field>
                <Field label="Payment prefix">
                  <Input name="paymentPrefix" defaultValue={numbering?.paymentPrefix ?? "PAY-"} />
                </Field>
              </div>
              <p className="text-xs text-muted">Numbers keep counting from where they are; only the prefix changes.</p>
              <div>
                <Button variant="primary">Save</Button>
              </div>
            </form>
          </Panel>
          <Panel title="AI Trainer · Gym Partnership">
            {trainerCode ? (
              <>
                <p className="text-sm">
                  Your gym&apos;s trainer code is <strong className="font-mono text-lg tracking-wider">{trainerCode}</strong>. Members type it into the FITRON AI Trainer (or open{" "}
                  <a className="underline" href={`${appUrl()}/trainer?gym=${trainerCode}`} target="_blank" rel="noopener">
                    {appUrl()}/trainer?gym={trainerCode}
                  </a>
                  ) to link to your gym.
                </p>
                <p className="text-xs text-muted">
                  You see their training next to their membership and earn {Math.round(PARTNER_SHARE * 100)}% of what they pay FITRON for the AI Trainer. <Link className="underline" href="/partnership">Open Gym Partnership</Link>.
                </p>
              </>
            ) : (
              <form action={makeTrainerCode} className="flex flex-col gap-3">
                <p className="text-sm text-muted">Make a code your members type into the FITRON AI Trainer to link to your gym. You then see their training here and earn {Math.round(PARTNER_SHARE * 100)}% of what they pay FITRON for it.</p>
                <div>
                  <Button variant="primary">Make our trainer code</Button>
                </div>
              </form>
            )}
          </Panel>
        </div>
      )}
      {tab === "billing" && (
        <div className="max-w-[720px]">
          <Panel title="Billing & GST">
            <TaxForm tax={tax} invoicePrefix={numbering?.invoicePrefix ?? "INV-"} nextNumber={nextInvoice} />
          </Panel>
        </div>
      )}
      {tab === "wa" && (
        <div className="max-w-[720px]">
          <Panel title="WhatsApp" id="whatsapp">
            <form action={saveWhatsApp} className="flex flex-col gap-3 text-sm">
              <Field label="How messages are sent">
                <Select name="mode" defaultValue={wa.mode}>
                  <option value="demo">Demo: log only, send nothing</option>
                  <option value="cloud">WhatsApp Cloud API (official)</option>
                  <option value="connector">Linked gym phone (connector)</option>
                </Select>
              </Field>
              <p className={waStatus.ok ? "text-ok" : "text-alert"}>{waStatus.text}</p>
              {waStatus.qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={waStatus.qr} alt="WhatsApp link QR code" className="size-48 rounded bg-white p-2" />
              )}
              <fieldset className="flex flex-wrap items-center gap-3">
                <legend className="mb-1 text-muted">Expiry reminders</legend>
                {[7, 3, 1, 0].map((d) => (
                  <label key={d} className="flex items-center gap-1.5">
                    <input type="checkbox" name="expiryDays" value={d} defaultChecked={wa.expiryDays.includes(d)} className="size-4" /> {d === 0 ? "On the day" : `${d} day${d > 1 ? "s" : ""} before`}
                  </label>
                ))}
              </fieldset>
              <label className="flex flex-wrap items-center gap-2">
                Remind about dues every
                <Input name="dueEveryDays" type="number" min={0} max={30} defaultValue={wa.dueEveryDays} className="w-20!" aria-label="Dues reminder interval" /> days (0 = off)
              </label>
              <label className="flex flex-wrap items-center gap-2">
                Don&apos;t repeat a reminder within
                <Input name="dedupDays" type="number" min={0} max={30} defaultValue={wa.dedupDays} className="w-20!" aria-label="De-duplication days" /> days
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="birthdays" defaultChecked={wa.birthdays} className="size-4" /> Send birthday wishes
              </label>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Save</Button>
                <Link href="/whatsapp/templates" className="inline-flex min-h-10 items-center rounded-md border border-line px-4">
                  Edit templates
                </Link>
              </div>
            </form>
          </Panel>
        </div>
      )}
      {tab === "int" && (
        <div className="grid max-w-[960px] gap-10 lg:grid-cols-2">
          <Panel title="UPI Autopay (Razorpay)">
            <form action={saveAutopay} className="flex flex-col gap-3 text-sm">
              <Field label="Mode">
                <Select name="mode" defaultValue={autopayMode}>
                  <option value="demo">Demo: simulate approvals and debits</option>
                  <option value="live">Live: Razorpay Subscriptions</option>
                </Select>
              </Field>
              <p className={rzpMissing ? "text-muted" : "text-ok"}>
                {rzpMissing
                  ? `Live mode needs ${rzpMissing.replace(" are not set on the server.", "")} on the server, and a Razorpay webhook to /api/webhooks/razorpay.`
                  : "Razorpay keys are set on the server."}
              </p>
              <p className="text-muted">Existing mandates keep the mode they were created in.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Save</Button>
                <Link href="/settings/jobs" className="inline-flex min-h-10 items-center rounded-md border border-line px-4">
                  Daily jobs
                </Link>
              </div>
            </form>
          </Panel>
          <Panel title="Fitron AI">
            <p className="text-sm text-muted">
              The assistant uses the Anthropic API. Set ANTHROPIC_API_KEY on the server to switch it on; it only reads what each person&apos;s role can see and never sends anything without their OK.
            </p>
          </Panel>
        </div>
      )}
      {tab === "branches" && (
        <Panel title="Branches">
          <div className="flex flex-col gap-6">
            {branches.length >= 3 && (
              <p className="text-sm text-muted">
                Your plan includes 3 branches. Each one after that needs a paid slot from{" "}
                <Link href="/settings/billing" className="text-accent">
                  Plan &amp; billing
                </Link>
                .
              </p>
            )}
            {[...branches, null].map((b) => (
              <form
                key={b?.id ?? "new"}
                action={saveBranchAction.bind(null, b?.id ?? null)}
                className="grid gap-3 border-b border-line pb-6 last:border-0 last:pb-0 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr_1fr_auto] lg:items-end"
              >
                <Field label={b ? "Name" : "New branch name"}>
                  <Input name="name" defaultValue={b?.name} required />
                </Field>
                <Field label="Address">
                  <Input name="address" defaultValue={b?.address} required />
                </Field>
                <Field label="Phone">
                  <Input name="phone" defaultValue={b?.phone} required />
                </Field>
                <Field label="GSTIN">
                  <Input name="gstin" defaultValue={b?.gstin ?? ""} />
                </Field>
                <Button variant={b ? "default" : "primary"}>{b ? "Save" : "Add branch"}</Button>
              </form>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

/** One settings section: a heading over its form, as in the prototype. */
function Panel({ title, id, className, children }: { title: string; id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`flex scroll-mt-20 flex-col gap-3 ${className ?? ""}`}>
      <h3 className="text-xl">{title}</h3>
      {children}
    </section>
  );
}
