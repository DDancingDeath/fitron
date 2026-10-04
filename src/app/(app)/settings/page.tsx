import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { getGymProfile, getSetting } from "@/lib/services/settings";
import { getTax } from "@/lib/services/tax";
import { nextInvoiceNumber } from "@/lib/services/billing";
import { Button, Field, Input, LinkButton, Notice, Select, Textarea } from "@/components/ui";
import { gymLogoUrl } from "@/components/gym-logo";
import { LogoForm } from "./logo-form";
import { TaxForm } from "./tax-form";
import { SETTINGS_TABS, SectionTabs } from "@/components/section-tabs";
import { makeTrainerCode, saveAutopay, saveBranchAction, saveGym, saveNumbering, saveReminders, saveWhatsApp, sendTestAction, simulateLinkAction, unlinkAction } from "./actions";
import { getReminderSettings, getWaSettings, listTemplates } from "@/lib/services/whatsapp";
import { reminderSchedule } from "@/lib/services/reminders";
import { LinkWatcher } from "./link-watcher";
import { Dialog } from "@/components/dialog";
import { ConfirmButton } from "@/components/confirm-button";
import { PaperPlaneTiltIcon, QrCodeIcon, WhatsappLogoIcon } from "@phosphor-icons/react/dist/ssr";
import { fmtClock, fmtShort, fmtTime } from "@/lib/format";
import { providerReady } from "@/lib/integrations/whatsapp";
import { getAccessRules } from "@/lib/services/attendance";
import { JOBS, recentRuns } from "@/lib/services/jobs";
import { todayIso } from "@/lib/services/time";
import { EXPIRY_CHIPS, expiryChipLabel, scheduledJobRows } from "@/lib/domain/reminders";
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
            reminders: "reminders",
            whatsapp: "wa",
            autopay: "int",
            branches: "branches",
          } as Record<string, string>
        )[section ?? ""];
  const tab = ["gym", "billing", "reminders", "wa", "int", "branches"].includes(asked ?? "") ? asked! : "gym";
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
  const reminders =
    tab === "reminders"
      ? await (async () => {
          const [stored, schedule, access, templates, runs] = await Promise.all([getReminderSettings(u.orgId), reminderSchedule(u.orgId), getAccessRules(u.orgId), listTemplates(u.orgId), recentRuns(u.orgId)]);
          // The expiry days and birthday wishes are the templates' Auto-send switches, which the rule engine reads.
          const settings = { ...stored, ...schedule };
          const today = todayIso();
          return {
            settings,
            graceDays: access.graceDays,
            jobs: scheduledJobRows(settings, {
              winbackOn: templates.find((t) => t.key === "winback")?.autoSend ?? false,
              jobs: JOBS.map((j) => ({ name: j.name, label: j.label })),
              runs: runs.filter((r) => r.day === today).map((r) => ({ name: r.name, startedAt: r.startedAt, result: r.result as Record<string, unknown> | null, error: r.error, finishedAt: r.finishedAt })),
            }),
          };
        })()
      : null;
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
      {typeof sp.msg === "string" && <Notice tone="ok">{sp.msg}</Notice>}
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
      {tab === "reminders" && reminders && (
        <div className="flex max-w-[720px] flex-col gap-[22px]">
          {!u.has("whatsapp") && <Notice>Automatic WhatsApp reminders are on the Professional plan. Default membership duration and the grace period apply on every plan.</Notice>}
          <form action={saveReminders} className="flex flex-col gap-[22px]">
            <div>
              <h4 className="mb-2 text-lg">Expiry reminders</h4>
              <div className="flex flex-wrap gap-2">
                {EXPIRY_CHIPS.map((d) => (
                  <label key={d}>
                    <input type="checkbox" name="expiryDays" value={d} defaultChecked={reminders.settings.expiryDays.includes(d)} className="peer sr-only" />
                    <span className="inline-block cursor-pointer rounded-md border border-line px-3 py-[7px] text-[13px] peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:ring-2">
                      {expiryChipLabel(d)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-x-6 gap-y-[18px] [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
              <Field label="Don’t repeat a reminder within (days)" hint="The same reminder is never sent to a member twice inside this window.">
                <Input name="dedupDays" type="number" min={0} max={30} required defaultValue={reminders.settings.dedupDays} />
              </Field>
              <Field label="Payment due reminder every (days)" hint="0 = off. Sent while an invoice is overdue.">
                <Input name="dueEveryDays" type="number" min={0} max={30} required defaultValue={reminders.settings.dueEveryDays} />
              </Field>
              <Field label="Default membership duration (months)" hint="Pre-selects the plan of this length when selling, and the length of a new plan.">
                <Input name="defaultMonths" type="number" min={1} max={60} required defaultValue={reminders.settings.defaultMonths} />
              </Field>
              <Field label="Grace period after expiry (days)" hint="Expired members may still check in for this many days. The same number is under Check-in devices › Door access rules.">
                <Input name="graceDays" type="number" min={0} max={60} required defaultValue={reminders.graceDays} />
              </Field>
            </div>
            <label className="flex items-center gap-2.5 text-[15px]">
              <input type="checkbox" name="birthdays" defaultChecked={reminders.settings.birthdays} className="size-[18px] accent-accent" />
              Send birthday wishes automatically
            </label>
            <div>
              <Button variant="primary">Save</Button>
            </div>
            <p className="text-xs text-muted">
              Changes are recorded in the audit log. Reminders go out from the daily jobs each morning using the WhatsApp templates (
              <Link href="/whatsapp/templates" className="underline">
                Edit templates
              </Link>
              ).
            </p>
          </form>
          <div>
            <h4 className="mb-2 text-lg">Scheduled jobs</h4>
            {reminders.jobs.map((j, i) => (
              <div key={i} className="flex justify-between gap-3 border-b border-line py-[7px] text-sm">
                <span>{j.k}</span>
                <span className="text-right text-muted">{j.v}</span>
              </div>
            ))}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <LinkButton href="/settings/jobs">Daily jobs</LinkButton>
              <span className="text-xs text-muted">Run them now or see past days under Daily jobs.</span>
            </div>
          </div>
        </div>
      )}
      {tab === "wa" && (
        <div className="flex max-w-[760px] flex-col gap-5">
          {!u.has("whatsapp") && <Notice>Automatic WhatsApp messages are on the Professional plan.</Notice>}
          <LinkedCard wa={wa} cloud={wa.mode === "cloud" && waStatus.ok ? { number: waStatus.number ?? "", name: waStatus.name ?? "" } : null} canUse={u.has("whatsapp")} />
          <p className="m-0 text-[13px] text-muted">
            Quiet hours {fmtClock(wa.quietFrom)} – {fmtClock(wa.quietTo)} ·{" "}
            <Link href="/whatsapp" className="underline">
              change them from Edit rule on any template
            </Link>
          </p>
          <Panel title="WhatsApp" id="whatsapp">
            <form action={saveWhatsApp} className="flex flex-col gap-3 text-sm">
              <Field label="How messages are sent">
                <Select name="mode" key={wa.mode} defaultValue={wa.mode}>
                  <option value="demo">Demo: log only, send nothing</option>
                  <option value="cloud">WhatsApp Cloud API (official)</option>
                  <option value="connector">Linked gym phone (connector)</option>
                </Select>
              </Field>
              <p className={waStatus.ok ? "text-ok" : "text-alert"}>{waStatus.text}</p>
              <p className="text-xs text-muted">
                Reminder days, cadence and birthday wishes are under{" "}
                <Link href="/settings?tab=reminders" className="underline">
                  Settings › Reminders
                </Link>
                .
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Save</Button>
                <Link href="/whatsapp/templates" className="inline-flex min-h-10 items-center rounded-md border border-line px-4">
                  Edit templates
                </Link>
              </div>
            </form>
          </Panel>
          {sp.link === "1" && u.has("whatsapp") && (
            <Dialog kicker="WhatsApp" title="Link WhatsApp" close="/settings?tab=wa" width={600}>
              <LinkWatcher envMessage={providerReady("connector")} />
              <div className="flex flex-wrap justify-end gap-2.5">
                <form action={simulateLinkAction}>
                  <Button variant="ghost" title="For demos without a connector">
                    Simulate instead
                  </Button>
                </form>
                <LinkButton href="/settings?tab=wa" scroll={false}>
                  Cancel
                </LinkButton>
              </div>
            </Dialog>
          )}
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

/** The prototype's "Linked WhatsApp" card: the paired number with Send test / Unlink, or a Link WhatsApp button. */
function LinkedCard({ wa, cloud, canUse }: { wa: Awaited<ReturnType<typeof getWaSettings>>; cloud: { number: string; name: string } | null; canUse: boolean }) {
  const linked = wa.linked;
  const at = linked?.at ? new Date(linked.at) : null;
  return (
    <section className="flex max-w-[760px] flex-col gap-2.5 rounded-lg bg-surface px-5 py-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <WhatsappLogoIcon size={28} weight="duotone" className="text-accent" />
          <div>
            <div className="font-semibold">Linked WhatsApp</div>
            {linked || cloud ? (
              <div className="text-[13px]">
                {linked ? `+91 ${linked.number}` : cloud!.number} · <span className="text-accent">Connected</span>
                <span className="block text-xs text-muted">{linked ? `${linked.device} · linked ${at && !Number.isNaN(at.getTime()) ? `${fmtShort(at)}, ${fmtTime(at)}` : "—"}` : `WhatsApp Cloud API · ${cloud!.name}`}</span>
              </div>
            ) : (
              <div className="text-[13px] text-muted">Not linked · no API key needed, just scan a QR code</div>
            )}
          </div>
        </div>
        {linked || cloud ? (
          <div className="flex gap-1">
            <form action={sendTestAction}>
              <Button disabled={!canUse}>
                <PaperPlaneTiltIcon size={16} weight="duotone" />
                Send test
              </Button>
            </form>
            {linked && (
              <form action={unlinkAction}>
                <ConfirmButton variant="ghost" className="text-alert hover:bg-alert-soft" confirm="Unlink WhatsApp? Automatic sending stops. Messages are logged until you link again." disabled={!canUse}>
                  Unlink
                </ConfirmButton>
              </form>
            )}
          </div>
        ) : (
          <LinkButton href={canUse ? "/settings?tab=wa&link=1" : "/settings/billing?upgrade=whatsapp"} variant="primary" scroll={false}>
            <QrCodeIcon size={16} weight="duotone" />
            Link WhatsApp
          </LinkButton>
        )}
      </div>
      <div className="text-[13px] leading-relaxed">
        Works like WhatsApp Web: the Fitron connector (a small app on the gym computer or our server) stays linked to your WhatsApp and sends reminders, invoices and renewals by itself at the scheduled time. It sends one message every 8 to 15 seconds, up to 250 a day, to keep your number safe.
      </div>
      <div className="text-xs leading-relaxed text-alert">This is unofficial automation of WhatsApp. WhatsApp can restrict numbers that send too many messages to people who haven&apos;t saved your number. Use it for your own members only, never cold broadcasts, and keep a backup number.</div>
    </section>
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
