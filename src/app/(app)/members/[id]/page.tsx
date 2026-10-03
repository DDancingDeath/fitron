import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  BellRingingIcon,
  ClockCounterClockwiseIcon,
  FileImageIcon,
  FilePdfIcon,
  FilePlusIcon,
  HandCoinsIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  TrashIcon,
  UploadSimpleIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react/dist/ssr";
import { requirePermission } from "@/lib/auth/current";
import { getMember } from "@/lib/services/members";
import { memberHistory } from "@/lib/services/billing";
import { InvoiceStatusBadge } from "@/components/invoice-status";
import { Button, Input, LinkButton, Notice, Select, TABLE, TD, TH, TR, cx } from "@/components/ui";
import { MemberStatus, STATUS_LABEL } from "@/components/status";
import { Tag } from "@/components/tag";
import { ConfirmButton } from "@/components/confirm-button";
import { fmtDate, fmtShort, fmtStamp, fmtTime, formatRupees, initials } from "@/lib/format";
import { deleteDocumentAction, enrolBiometric, eraseBiometric, removeMember, replaceDocumentAction, toggleSuspend, uploadDocumentAction } from "../actions";
import { remindDueAction } from "../../reminder-actions";
import { DOC_KINDS, listDocuments } from "@/lib/services/documents";
import { memberBiometrics } from "@/lib/services/biometric";
import { db } from "@/lib/db";
import { memberVisits } from "@/lib/services/attendance";
import { memberBookings } from "@/lib/services/classes";
import { listDiets, listWorkouts, progressFor } from "@/lib/services/programs";
import { fromIso, todayIso } from "@/lib/services/time";
import { addDays, daysBetween } from "@/lib/domain/dates";
import { AssignForm, ProgressForm } from "./fitness";
import { SendOneForm } from "../../whatsapp/wa-forms";
import { listMessages, listTemplates } from "@/lib/services/whatsapp";
import { trainerStatusFor } from "@/lib/services/trainer-gym";
import { findPlan } from "@/lib/domain/pricing";

export const metadata = { title: "Member · Fitron" };

const TYPE_LABEL: Record<string, string> = { NEW: "New", RENEWAL: "Renewal", AUTOPAY: "Autopay", IMPORT: "Imported" };
const riskLevel = (score: number | null) => (score === null ? null : score >= 60 ? "High risk" : score >= 40 ? "Medium risk" : null);
const age = (dob: Date, today: string) => Math.floor(daysBetween(today, dob.toISOString().slice(0, 10)) / 365.25);

/** One label/value row of the overview, as in the prototype (140px label column). */
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-1.5 text-sm">
    <span className="text-muted">{k}</span>
    <span className="[overflow-wrap:anywhere] whitespace-pre-wrap">{v || v === 0 ? v : "—"}</span>
  </div>
);

const Section = ({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={className}>
    <h4 className="mb-2.5 text-lg">{title}</h4>
    {children}
  </section>
);

export default async function MemberPage({ params, searchParams }: PageProps<"/members/[id]">) {
  const u = await requirePermission("members.view");
  const { id } = await params;
  const m = await getMember(u, id);
  if (!m) notFound();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = todayIso();

  const canBilling = u.can("invoices.view");
  const canAttendance = u.can("attendance.manage");
  const canPrograms = u.can("programs.manage");
  const canWa = u.can("whatsapp.send");
  const canDocs = u.can("documents.manage") && !m.walkIn;
  const canBio = u.can("members.edit") && !m.walkIn;

  const [history, visits, visits30, bookings, workouts, diets, progress, docs] = await Promise.all([
    canBilling ? memberHistory(u, m.id) : null,
    canAttendance ? memberVisits(m.id, 40) : null,
    canAttendance ? db.attendance.count({ where: { memberId: m.id, date: { gte: fromIso(addDays(today, -30)) } } }) : null,
    u.can("classes.manage") ? memberBookings(m.id) : null,
    listWorkouts(u),
    listDiets(u),
    progressFor(m.id),
    canDocs ? listDocuments(u, m.id) : null,
  ]);
  const [templates, messages] = canWa ? await Promise.all([listTemplates(u.orgId), listMessages(u, { memberId: m.id })]) : [[], null];
  const [bio, devices] = canBio ? await Promise.all([memberBiometrics(m.id), db.device.findMany({ where: { orgId: u.orgId, approved: true, branchId: { in: u.branchIds } }, orderBy: { createdAt: "asc" } })]) : [null, []];
  const receivers = history ? await db.user.findMany({ where: { id: { in: [...new Set(history.payments.map((p) => p.receivedById))] } }, select: { id: true, name: true } }) : [];
  const receivedBy = new Map(receivers.map((x) => [x.id, x.name]));
  const createdBy = m.createdById ? await db.user.findUnique({ where: { id: m.createdById }, select: { name: true } }) : null;
  const trainer = m.walkIn ? null : await trainerStatusFor(u, m.id, today);

  const workout = workouts.find((w) => w.id === m.workoutPlanId);
  const diet = diets.find((d) => d.id === m.dietPlanId);
  const current = history?.memberships.find((x) => x.status !== "CANCELLED");
  const curInvoice = current && history?.invoices.find((i) => i.id === current.invoice.id);
  const openInvoices = (history?.invoices ?? []).filter((i) => i.balance > 0).sort((a, b) => +a.date - +b.date);
  const lastInvoice = history?.invoices.find((i) => i.status !== "CANCELLED");
  const daysLeft = m.latestEnd ? daysBetween(m.latestEnd, today) : null;
  const expired = daysLeft !== null && daysLeft < 0;
  const risk = riskLevel(m.riskScore);
  const lifetime = (history?.payments ?? []).filter((p) => p.status === "SUCCESS").reduce((a, p) => a + p.amount, 0);
  const lastVisit = visits?.[0];

  // Tabs, by what this role may see. Results of document and biometric actions land on their own tab.
  const tabs = [
    ["overview", "Overview"],
    ...(history ? [["payments", "Payments"], ["invoices", "Invoices"], ["memberships", "Renewal history"]] : []),
    ...(visits || bio || bookings ? [["attendance", "Attendance"]] : []),
    ["fitness", "Fitness"],
    ...(docs ? [["documents", "Documents"]] : []),
    ...(canWa ? [["whatsapp", "WhatsApp"]] : []),
  ] as [string, string][];
  const asked = str("tab") ?? (str("doc") || str("docError") ? "documents" : str("bio") || str("bioError") ? "attendance" : "overview");
  const tab = tabs.some(([k]) => k === asked) ? asked : "overview";
  const tabHref = (k: string) => `/members/${m.id}${k === "overview" ? "" : `?tab=${k}`}`;
  const here = `/members/${m.id}?tab=${tab}`;
  const msg = str("msg");

  const stats: { label: string; value: string; tone?: "alert" | "accent" }[] = [
    { label: "Plan", value: m.planName ?? "—" },
    { label: "Valid till", value: m.latestEnd ? fmtShort(m.latestEnd) : "—" },
    { label: "Days left", value: daysLeft === null ? "—" : expired ? "Expired" : String(daysLeft), tone: expired ? "alert" : daysLeft !== null && daysLeft <= 7 ? "accent" : undefined },
    { label: "Outstanding", value: formatRupees(m.outstanding), tone: m.outstanding ? "alert" : undefined },
    ...(history ? [{ label: "Lifetime paid", value: formatRupees(lifetime) }] : []),
    ...(visits30 !== null ? [{ label: "Visits · 30 days", value: String(visits30) }] : []),
    ...(risk ? [{ label: "Fitron AI", value: risk, tone: "alert" as const }] : []),
  ];

  const isAdmin = u.can("members.delete");
  return (
    <div className="flex flex-col gap-8 pt-3">
      <LinkButton href="/members" variant="ghost" className="self-start">
        <ArrowLeftIcon size={16} weight="duotone" />
        All members
      </LinkButton>

      <div className="flex flex-wrap items-center gap-6">
        <div className="grid size-24 shrink-0 place-items-center rounded-full bg-neutral-200 text-[32px] font-semibold text-neutral-800">{initials(m.name)}</div>
        <div className="min-w-60 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-[30px] lg:text-[38px]">{m.name}</h1>
            <MemberStatus status={m.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-[18px] gap-y-1 text-sm text-muted">
            <span>{m.code}</span>
            <span>{m.phone}</span>
            {m.planName && <span>{m.planName}</span>}
            {m.latestEnd && <span>Expires {fmtDate(m.latestEnd)}</span>}
            {u.branch === "ALL" && <span>{m.branch.name}</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {u.can("payments.collect") && openInvoices[0] && (
          <LinkButton href={`/invoices/${openInvoices[0].id}#collect`} variant={expired ? "default" : "primary"}>
            <HandCoinsIcon size={16} weight="duotone" />
            Collect payment
          </LinkButton>
        )}
        {u.can("memberships.renew") && !m.walkIn && (
          <LinkButton href={`/members/${m.id}/sell`} variant={expired || !openInvoices[0] || !u.can("payments.collect") ? "primary" : "default"}>
            <ArrowsClockwiseIcon size={16} weight="duotone" />
            {m.latestEnd ? "Renew membership" : "Sell membership"}
          </LinkButton>
        )}
        {u.can("invoices.create") && (
          <LinkButton href={`/invoices/new?member=${m.id}`}>
            <FilePlusIcon size={16} weight="duotone" />
            Create invoice
          </LinkButton>
        )}
        {canWa && lastInvoice && (
          <LinkButton href={`${tabHref("whatsapp")}&invoice=${lastInvoice.id}#send`}>
            <WhatsappLogoIcon size={16} weight="duotone" />
            Send invoice on WhatsApp
          </LinkButton>
        )}
        {canWa && openInvoices[0] && (
          <form action={remindDueAction.bind(null, m.id, openInvoices[0].number, here)}>
            <Button>
              <BellRingingIcon size={16} weight="duotone" />
              Send payment reminder
            </Button>
          </form>
        )}
        {docs && (
          <LinkButton href={`${tabHref("documents")}#upload`}>
            <UploadSimpleIcon size={16} weight="duotone" />
            Upload document
          </LinkButton>
        )}
        {u.can("members.edit") && (
          <LinkButton href={`/members/${m.id}/edit`}>
            <PencilSimpleIcon size={16} weight="duotone" />
            Edit member
          </LinkButton>
        )}
        {u.can("members.edit") && (
          <form action={toggleSuspend.bind(null, m.id, !m.suspended)}>
            <Button variant="ghost">
              {m.suspended ? <PlayIcon size={16} weight="duotone" /> : <PauseIcon size={16} weight="duotone" />}
              {m.suspended ? "Resume" : "Suspend"}
            </Button>
          </form>
        )}
        {isAdmin && (
          <form action={removeMember.bind(null, m.id)}>
            <ConfirmButton variant="ghost" confirm={`Delete ${m.name}? Their invoices and payments are kept.`}>
              <TrashIcon size={16} weight="duotone" />
              Delete member
            </ConfirmButton>
          </form>
        )}
        {history && (
          <LinkButton href={tabHref("payments")} variant="ghost">
            <ClockCounterClockwiseIcon size={16} weight="duotone" />
            Payment history
          </LinkButton>
        )}
      </div>

      {msg && <Notice tone="ok">{msg}</Notice>}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-6">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-[11px] tracking-[0.08em] text-muted uppercase">{s.label}</div>
            <div className={cx("text-2xl font-semibold", s.tone === "alert" && "text-alert-700", s.tone === "accent" && "text-accent-700")}>{s.value}</div>
          </div>
        ))}
      </div>

      <nav className="-mb-4 flex flex-wrap gap-1 overflow-x-auto" aria-label="Member sections">
        {tabs.map(([k, label]) => (
          <Link key={k} href={tabHref(k)} aria-current={k === tab ? "page" : undefined} className={cx("border-b-2 px-3 py-2 text-sm", k === tab ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-x-14 gap-y-10">
          <Section title="Personal">
            <Row k="Member ID" v={m.code} />
            <Row k="Full name" v={m.name} />
            <Row k="Date of birth" v={m.dob ? `${fmtDate(m.dob)} (${age(m.dob, today)} yrs)` : null} />
            <Row k="Gender" v={m.gender} />
            <Row k="Occupation" v={m.occupation} />
            <Row k="Heard about us" v={m.source} />
            <Row k="Tags" v={m.tags.join(", ")} />
            <Row k="Trainer" v={m.trainerName} />
          </Section>
          <Section title="Contact">
            <Row k="Mobile" v={m.phone} />
            <Row k="WhatsApp" v={m.whatsapp ?? m.phone} />
            <Row k="Email" v={m.email} />
          </Section>
          {trainer && (
            <Section title="AI Trainer">
              <Row k="Plan" v={`${findPlan(trainer.plan)?.name ?? trainer.plan} · ${trainer.access === "ACTIVE" ? `paid till ${fmtShort(trainer.paidUntil!)}` : trainer.access === "TRIAL" ? `free trial till ${fmtShort(trainer.trialEndsAt!)}` : "no plan"}`} />
              <Row k="This week" v={`${trainer.weekWorkouts} of ${trainer.weekPlanned} workouts`} />
              <Row k="Streak" v={trainer.streak ? `${trainer.streak} days` : "—"} />
              <Row k="Workouts" v={`${trainer.totalWorkouts} logged`} />
              <Row k="Last seen" v={trainer.lastSeenAt ? fmtStamp(trainer.lastSeenAt) : null} />
              <Row k="Linked" v={trainer.linkedAt ? fmtStamp(trainer.linkedAt) : null} />
              <p className="mt-2 text-xs text-muted">
                Linked through the Gym Partnership. <Link className="underline" href="/partnership">All linked members</Link>
              </p>
            </Section>
          )}
          <Section title="Address">
            <Row k="House / flat" v={m.house} />
            <Row k="Area / street" v={m.area} />
            <Row k="City" v={m.city} />
            <Row k="State" v={m.state} />
            <Row k="PIN code" v={m.pin} />
          </Section>
          <Section title="Emergency contact">
            <Row k="Name" v={m.emergencyName} />
            <Row k="Relationship" v={m.emergencyRelation} />
            <Row k="Phone" v={m.emergencyPhone} />
          </Section>
          {current && (
            <Section title="Membership">
              <Row k="Plan" v={`${current.plan.name}${current.pricingCategory && current.pricingCategory !== "Standard" ? ` · ${current.pricingCategory}` : ""}`} />
              <Row k="Type" v={TYPE_LABEL[current.type] ?? current.type} />
              <Row k="Start date" v={fmtDate(current.startDate)} />
              <Row k="End date" v={fmtDate(current.endDate)} />
              <Row k="Status" v={STATUS_LABEL[m.status]} />
              <Row k="Price" v={formatRupees(current.price)} />
              <Row k="Discount" v={`${formatRupees(current.discount)}${current.offerCode ? ` (${current.offerCode})` : ""}`} />
              {curInvoice && (
                <>
                  <Row k="Final amount" v={formatRupees(curInvoice.total)} />
                  <Row k="Amount paid" v={formatRupees(curInvoice.paid)} />
                  <Row k="Pending" v={formatRupees(curInvoice.balance)} />
                  <Row k="Payment status" v={<InvoiceStatusBadge status={curInvoice.status} overdueDays={curInvoice.overdueDays} />} />
                </>
              )}
              <Row k="Renewal date" v={fmtDate(addDays(current.endDate.toISOString().slice(0, 10), 1))} />
            </Section>
          )}
          <Section title="Notes">
            <Row k="Notes" v={m.notes} />
            <Row k="Staff notes" v={m.staffNotes} />
            <Row k="Created by" v={createdBy?.name} />
            <Row k="Joined" v={fmtStamp(m.createdAt)} />
          </Section>
        </div>
      )}

      {tab === "payments" && history && (
        history.payments.length === 0 ? (
          <p className="text-muted">No payments recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={cx(TABLE, "min-w-[760px]")}>
              <thead>
                <tr>
                  {["Payment ID", "Date", "Invoice", "Method", "Transaction ID", "Received by", "Status"].map((h) => (
                    <th key={h} className={TH}>{h}</th>
                  ))}
                  <th className={cx(TH, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {history.payments.map((p) => (
                  <tr key={p.id} className={TR}>
                    <td className={TD}>{p.code}</td>
                    <td className={cx(TD, "whitespace-nowrap")}>{fmtDate(p.date)}</td>
                    <td className={TD}>
                      <Link href={`/invoices/${p.invoice.id}`} className="hover:text-accent">{p.invoice.number}</Link>
                    </td>
                    <td className={TD}>{p.method}</td>
                    <td className={TD}>{p.txnRef || "—"}</td>
                    <td className={TD}>{receivedBy.get(p.receivedById) ?? "—"}</td>
                    <td className={TD}>
                      <Tag label={p.status === "SUCCESS" ? "Success" : "Reversed"} />
                    </td>
                    <td className={cx(TD, "text-right tabular-nums", p.status !== "SUCCESS" && "text-muted line-through")}>{formatRupees(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "invoices" && history && (
        history.invoices.length === 0 ? (
          <p className="text-muted">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={cx(TABLE, "min-w-[720px]")}>
              <thead>
                <tr>
                  <th className={TH}>Invoice</th>
                  <th className={TH}>Date</th>
                  <th className={TH}>Items</th>
                  <th className={cx(TH, "text-right")}>Total</th>
                  <th className={cx(TH, "text-right")}>Paid</th>
                  <th className={cx(TH, "text-right")}>Balance</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.invoices.map((i) => (
                  <tr key={i.id} className={TR}>
                    <td className={TD}>
                      <Link href={`/invoices/${i.id}`} className="hover:text-accent">{i.number}</Link>
                    </td>
                    <td className={cx(TD, "whitespace-nowrap")}>{fmtDate(i.date)}</td>
                    <td className={TD}>{i.items.map((x) => x.description.split(" (")[0]).join(", ")}</td>
                    <td className={cx(TD, "text-right tabular-nums")}>{formatRupees(i.total)}</td>
                    <td className={cx(TD, "text-right tabular-nums")}>{formatRupees(i.paid)}</td>
                    <td className={cx(TD, "text-right tabular-nums")}>{formatRupees(i.balance)}</td>
                    <td className={TD}>
                      <InvoiceStatusBadge status={i.status} overdueDays={i.overdueDays} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "memberships" && history && (
        history.memberships.length === 0 ? (
          <p className="text-muted">No memberships yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={cx(TABLE, "min-w-[720px]")}>
              <thead>
                <tr>
                  {["Membership ID", "Plan", "Type", "Start", "End", "Invoice"].map((h) => (
                    <th key={h} className={TH}>{h}</th>
                  ))}
                  <th className={cx(TH, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {history.memberships.map((x) => (
                  <tr key={x.id} className={cx(TR, x.status === "CANCELLED" && "text-muted")}>
                    <td className={TD}>{x.code}</td>
                    <td className={TD}>
                      {x.plan.name}
                      {x.status === "CANCELLED" && <Tag label="Cancelled" className="ml-2" />}
                    </td>
                    <td className={TD}>{TYPE_LABEL[x.type] ?? x.type}</td>
                    <td className={cx(TD, "whitespace-nowrap")}>{fmtDate(x.startDate)}</td>
                    <td className={cx(TD, "whitespace-nowrap")}>{fmtDate(x.endDate)}</td>
                    <td className={TD}>
                      <Link href={`/invoices/${x.invoice.id}`} className="hover:text-accent">{x.invoice.number}</Link>
                    </td>
                    <td className={cx(TD, "text-right tabular-nums")}>{formatRupees(x.price - x.discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "attendance" && (
        <div className="flex flex-col gap-10">
          {visits && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                {visits30} visit{visits30 === 1 ? "" : "s"} in the last 30 days{lastVisit ? ` · last visit ${fmtDate(lastVisit.date)}` : ""}
              </p>
              {visits.length > 0 && (
                <div className="overflow-x-auto">
                  <table className={cx(TABLE, "min-w-[560px]")}>
                    <thead>
                      <tr>
                        {["Date", "Check-in", "Check-out", "Duration", "Method"].map((h) => (
                          <th key={h} className={TH}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visits.map((v) => (
                        <tr key={v.id} className={TR}>
                          <td className={TD}>{fmtDate(v.date)}</td>
                          <td className={TD}>{fmtTime(v.checkIn)}</td>
                          <td className={TD}>{v.checkOut ? fmtTime(v.checkOut) : v.date.toISOString().slice(0, 10) === today ? "In the gym" : "—"}</td>
                          <td className={TD}>{v.checkOut ? `${Math.round((+v.checkOut - +v.checkIn) / 60_000)} min` : "—"}</td>
                          <td className={TD}>
                            {v.method}
                            {v.override ? " · override" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {bookings && (
            <Section title="Class bookings">
              {bookings.length === 0 ? (
                <p className="text-sm text-muted">No class bookings.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {bookings.map((b) => (
                    <li key={b.id}>
                      <Link href={`/classes/${b.classSlot.id}?date=${b.date.toISOString().slice(0, 10)}`} className="flex justify-between gap-2 py-2 hover:text-accent">
                        <span>
                          {b.classSlot.name} · {fmtDate(b.date)}
                        </span>
                        <Tag label={b.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
          {bio && (
            <Section title="Biometric entry" className="max-w-2xl">
              <div id="biometric" className="flex flex-col gap-3 text-sm">
                {str("bio") && <Notice tone="ok">{str("bio")}</Notice>}
                {str("bioError") && <Notice tone="alert">{str("bioError")}</Notice>}
                <p>
                  {m.devicePin ? `Device PIN ${m.devicePin}` : "Not on any device yet"}
                  {bio.fingerprints || bio.faces ? ` · ${bio.fingerprints} fingerprint${bio.fingerprints === 1 ? "" : "s"}, ${bio.faces} face${bio.faces === 1 ? "" : "s"} stored (encrypted)` : ""}
                  {bio.devices.length ? ` · on ${bio.devices.map((d) => `${d.device.name ?? d.device.serial}${d.allowed ? "" : " (removed, plan not active)"}`).join(", ")}` : ""}
                </p>
                {m.biometricConsentAt && <p className="text-muted">Consent recorded {fmtStamp(m.biometricConsentAt)}.</p>}
                {devices.length === 0 ? (
                  <p className="text-muted">
                    No door device yet. {u.can("settings.manage") ? <Link href="/settings/devices" className="text-accent">Add one in Settings.</Link> : "Ask a Super Admin to add one."}
                  </p>
                ) : (
                  <form action={enrolBiometric.bind(null, m.id)} className="flex flex-col gap-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select name="deviceId" aria-label="Device">
                        {devices.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name ?? d.serial}
                          </option>
                        ))}
                      </Select>
                      <Select name="kind" aria-label="What to enrol">
                        <option value="FP">Fingerprint</option>
                        <option value="FACE">Face</option>
                      </Select>
                    </div>
                    {!m.biometricConsentAt && (
                      <label className="flex items-start gap-2">
                        <input type="checkbox" name="consent" className="mt-0.5 size-4" />
                        <span>The member has given written consent to store their fingerprint or face for gym entry, and knows they can ask for it to be deleted.</span>
                      </label>
                    )}
                    <div>
                      <Button variant="primary">Enrol on device</Button>
                    </div>
                  </form>
                )}
                {(m.devicePin || m.biometricConsentAt) && (
                  <form action={eraseBiometric.bind(null, m.id)}>
                    <ConfirmButton variant="danger" confirm="Delete this member's fingerprints and face data here and on every device?">
                      Delete biometric data
                    </ConfirmButton>
                  </form>
                )}
              </div>
            </Section>
          )}
        </div>
      )}

      {tab === "fitness" && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-x-14 gap-y-10">
          <section className="flex flex-col gap-3">
            <h4 className="text-lg">Program</h4>
            <Row k="Trainer" v={m.trainerName} />
            {canPrograms ? (
              <AssignForm memberId={m.id} workouts={workouts.filter((w) => w.active || w.id === m.workoutPlanId)} diets={diets.filter((d) => d.active || d.id === m.dietPlanId)} workoutId={m.workoutPlanId} dietId={m.dietPlanId} />
            ) : (
              <>
                <Row k="Workout plan" v={workout?.name} />
                <Row k="Diet plan" v={diet?.name} />
              </>
            )}
            {workout?.days.map((d) => (
              <div key={d.name}>
                <div className="mt-1.5 text-sm font-semibold">{d.name}</div>
                {d.exercises.map((x, i) => (
                  <div key={i} className="flex justify-between py-[3px] text-[13px]">
                    <span>{x.name}</span>
                    <span className="text-muted">{x.sets}</span>
                  </div>
                ))}
              </div>
            ))}
            {diet && (
              <div>
                <div className="mt-1.5 text-sm font-semibold">{diet.name}</div>
                {diet.meals.map((x) => (
                  <div key={x.name} className="flex justify-between gap-4 py-[3px] text-[13px]">
                    <span>{x.name}</span>
                    <span className="text-right text-muted">{x.food}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h4 className="text-lg">Progress</h4>
            {progress.length > 0 && <ProgressSummary progress={progress} />}
            {progress.length > 0 ? (
              <div className="overflow-x-auto">
                <table className={cx(TABLE, "min-w-[420px]")}>
                  <thead>
                    <tr>
                      <th className={TH}>Date</th>
                      <th className={cx(TH, "text-right")}>Weight</th>
                      <th className={cx(TH, "text-right")}>Body fat</th>
                      <th className={cx(TH, "text-right")}>Waist</th>
                      <th className={TH}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.map((p) => (
                      <tr key={p.id} className={TR}>
                        <td className={TD}>{fmtDate(p.date)}</td>
                        <td className={cx(TD, "text-right tabular-nums")}>{p.weightKg != null ? `${p.weightKg} kg` : "—"}</td>
                        <td className={cx(TD, "text-right tabular-nums")}>{p.bodyFat != null ? `${p.bodyFat}%` : "—"}</td>
                        <td className={cx(TD, "text-right tabular-nums")}>{p.waistCm != null ? `${p.waistCm} cm` : "—"}</td>
                        <td className={cx(TD, "text-muted")}>{p.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">No measurements yet.</p>
            )}
            {canPrograms && (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-accent">Log measurement</summary>
                <div className="mt-3">
                  <ProgressForm memberId={m.id} today={today} />
                </div>
              </details>
            )}
          </section>
        </div>
      )}

      {tab === "documents" && docs && (
        <div id="documents" className="flex flex-col gap-4">
          {str("doc") && <Notice tone="ok">{str("doc")}</Notice>}
          {str("docError") && <Notice tone="alert">{str("docError")}</Notice>}
          <p className="m-0 text-sm text-muted">Stored privately against this member. Every view is recorded in the audit log.</p>
          {docs.filter((d) => d.status === "ACTIVE").length === 0 ? (
            <p className="text-muted">No documents yet. Upload the signed registration form and ID proof.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              {docs
                .filter((d) => d.status === "ACTIVE")
                .map((d) => {
                  const Icon = d.fileName.toLowerCase().endsWith(".pdf") ? FilePdfIcon : FileImageIcon;
                  return (
                    <div key={d.id} className="flex flex-col gap-3 rounded-md border border-line p-4">
                      <div className="text-[11px] tracking-[0.08em] text-muted uppercase">{d.kind}</div>
                      <div className="flex items-center gap-2.5">
                        <Icon size={28} weight="duotone" className="shrink-0 text-accent" />
                        <div className="min-w-0">
                          <div className="text-[15px] font-semibold [overflow-wrap:anywhere]">{d.title}</div>
                          <div className="text-xs text-muted">
                            {Math.max(1, Math.round(d.size / 1024))} KB · {fmtStamp(d.createdAt)} · {d.uploadedBy}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <a href={`/documents/${d.id}`} target="_blank" rel="noopener" className="inline-flex min-h-[38px] items-center rounded-md px-1.5 text-sm font-semibold text-accent hover:bg-accent/10">
                          Open
                        </a>
                        <details className="w-full text-sm">
                          <summary className="cursor-pointer px-1.5 font-semibold text-accent">Replace or delete</summary>
                          <div className="mt-2 flex flex-col gap-2">
                            <form action={replaceDocumentAction.bind(null, m.id, d.id)} className="flex flex-col gap-2">
                              <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*" aria-label="New file" className="max-w-full text-sm" />
                              <div>
                                <Button>Replace</Button>
                              </div>
                            </form>
                            <form action={deleteDocumentAction.bind(null, m.id, d.id)} className="flex flex-col gap-2">
                              <Input name="reason" required placeholder="Reason for deleting" aria-label="Reason for deleting" />
                              <div>
                                <Button variant="danger">Delete</Button>
                              </div>
                            </form>
                          </div>
                        </details>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          <form id="upload" action={uploadDocumentAction.bind(null, m.id)} className="flex max-w-2xl flex-col gap-2 border-t border-line pt-4">
            <h4 className="text-lg">Upload document</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              <Select name="kind" aria-label="Kind of document" defaultValue="ID proof">
                {DOC_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </Select>
              <Input name="title" placeholder="Title, e.g. Aadhaar card" aria-label="Title" maxLength={80} />
            </div>
            <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*" aria-label="File" className="max-w-full text-sm" />
            <div>
              <Button variant="primary">
                <UploadSimpleIcon size={16} weight="duotone" />
                Upload
              </Button>
            </div>
            <p className="text-xs text-muted">PDF or photo, up to 10 MB.</p>
          </form>
          {docs.some((d) => d.status !== "ACTIVE") && (
            <div>
              <h4 className="mt-3 text-[17px]">Document history</h4>
              {docs
                .filter((d) => d.status !== "ACTIVE")
                .map((d) => (
                  <div key={d.id} className="py-1 text-[13px] text-muted">
                    <a href={`/documents/${d.id}`} target="_blank" rel="noopener" className="hover:text-accent">
                      {fmtStamp(d.createdAt)} · {d.title} · {d.fileName}
                    </a>{" "}
                    · {d.status === "REPLACED" ? "replaced by a newer version" : `deleted by ${d.deletedBy}: ${d.deleteReason}`}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {tab === "whatsapp" && canWa && (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3.5">
            {!messages?.rows.length ? (
              <p className="text-muted">No messages sent yet.</p>
            ) : (
              messages.rows.slice(0, 40).map((x) => (
                <div key={x.id} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted">
                    <WhatsappLogoIcon size={15} weight="duotone" className="text-accent" />
                    <span>
                      {templates.find((t) => t.key === x.templateKey)?.name ?? x.templateKey}
                      {x.attachment ? " · PDF attached" : ""} · {fmtStamp(x.sentAt)}, {fmtTime(x.sentAt)}
                    </span>
                    <Tag label={x.status} />
                  </div>
                  <div className="rounded-lg bg-surface px-3.5 py-2.5 text-sm whitespace-pre-wrap">{x.body}</div>
                </div>
              ))
            )}
          </div>
          <div id="send">
            <h4 className="mb-3 text-lg">Send a message</h4>
            <SendOneForm
              memberId={m.id}
              templates={templates.map((t) => ({ key: t.key, name: t.name, body: t.body }))}
              invoices={(history?.invoices ?? []).filter((i) => i.status !== "CANCELLED").map((i) => ({ id: i.id, number: i.number }))}
              invoiceId={str("invoice")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Latest weight and body fat with the change since the first measurement, and a weight line, as in the prototype. */
function ProgressSummary({ progress }: { progress: { date: Date; weightKg: number | null; bodyFat: number | null }[] }) {
  const asc = [...progress].reverse();
  const w = asc.filter((p) => p.weightKg != null) as { date: Date; weightKg: number }[];
  const f = asc.filter((p) => p.bodyFat != null) as { date: Date; bodyFat: number }[];
  const sign = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
  const lo = Math.min(...w.map((p) => p.weightKg));
  const hi = Math.max(...w.map((p) => p.weightKg));
  const pts = w.map((p, i) => `${(w.length > 1 ? (i / (w.length - 1)) * 300 : 150).toFixed(1)},${(hi === lo ? 40 : 70 - ((p.weightKg - lo) / (hi - lo)) * 60).toFixed(1)}`).join(" ");
  return (
    <>
      <div className="flex flex-wrap gap-8">
        {w.length > 0 && (
          <div>
            <div className="text-[11px] tracking-[0.08em] text-muted uppercase">Weight</div>
            <div className="text-2xl font-semibold">{w.at(-1)!.weightKg} kg</div>
            <div className="text-xs text-muted">
              {sign(w.at(-1)!.weightKg - w[0]!.weightKg)} kg since {fmtShort(w[0]!.date)}
            </div>
          </div>
        )}
        {f.length > 0 && (
          <div>
            <div className="text-[11px] tracking-[0.08em] text-muted uppercase">Body fat</div>
            <div className="text-2xl font-semibold">{f.at(-1)!.bodyFat}%</div>
            {f.length > 1 && <div className="text-xs text-muted">{sign(f.at(-1)!.bodyFat - f[0]!.bodyFat)} pts</div>}
          </div>
        )}
      </div>
      {w.length > 1 && (
        <svg viewBox="0 0 300 80" className="h-20 w-full max-w-[420px]" preserveAspectRatio="none" role="img" aria-label="Weight over time">
          <polyline points={pts} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </>
  );
}
