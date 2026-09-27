import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/current";
import { getMember } from "@/lib/services/members";
import { memberHistory } from "@/lib/services/billing";
import { InvoiceStatusBadge } from "@/components/invoice-status";
import Link from "next/link";
import { Badge, Button, Card, LinkButton, PageHeader } from "@/components/ui";
import { MemberStatus } from "@/components/status";
import { ConfirmButton } from "@/components/confirm-button";
import { fmtDate, formatInr, fmtStamp } from "@/lib/format";
import { removeMember, toggleSuspend } from "../actions";
import { memberVisits } from "@/lib/services/attendance";
import { memberBookings } from "@/lib/services/classes";
import { listDiets, listWorkouts, progressFor } from "@/lib/services/programs";
import { todayIso } from "@/lib/services/time";
import { fmtTime } from "@/lib/format";
import { AssignForm, ProgressForm } from "./fitness";

export const metadata = { title: "Member · Fitron" };

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-4 py-2">
    <dt className="text-muted">{label}</dt>
    <dd className="text-right">{value || "—"}</dd>
  </div>
);

export default async function MemberPage({ params }: PageProps<"/members/[id]">) {
  const u = await requirePermission("members.view");
  const { id } = await params;
  const m = await getMember(u, id);
  if (!m) notFound();
  const history = u.can("invoices.view") ? await memberHistory(u, m.id) : null;
  const canPrograms = u.can("programs.manage");
  const [visits, bookings, workouts, diets, progress] = await Promise.all([
    u.can("attendance.manage") ? memberVisits(m.id, 10) : null,
    u.can("classes.manage") ? memberBookings(m.id) : null,
    listWorkouts(u),
    listDiets(u),
    progressFor(m.id),
  ]);
  const workout = workouts.find((w) => w.id === m.workoutPlanId);
  const diet = diets.find((d) => d.id === m.dietPlanId);
  const address = [m.house, m.area, m.city, m.state, m.pin].filter(Boolean).join(", ");

  return (
    <>
      <PageHeader
        title={m.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {m.code} · {m.branch.name} <MemberStatus status={m.status} />
          </span>
        }
        actions={
          <>
            {u.can("memberships.renew") && (
              <LinkButton href={`/members/${m.id}/sell`} variant="primary">
                {m.latestEnd ? "Renew" : "Sell membership"}
              </LinkButton>
            )}
            {u.can("invoices.create") && <LinkButton href={`/invoices/new?member=${m.id}`}>New invoice</LinkButton>}
            {u.can("members.edit") && <LinkButton href={`/members/${m.id}/edit`}>Edit</LinkButton>}
            {u.can("members.edit") && (
              <form action={toggleSuspend.bind(null, m.id, !m.suspended)}>
                <Button>{m.suspended ? "Resume" : "Suspend"}</Button>
              </form>
            )}
            {u.can("members.delete") && (
              <form action={removeMember.bind(null, m.id)}>
                <ConfirmButton variant="danger" confirm={`Delete ${m.name}? Their invoices and payments are kept.`}>Delete</ConfirmButton>
              </form>
            )}
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <div className="text-sm text-muted">Current plan</div>
          <div className="mt-1 text-xl font-semibold">{m.planName ?? "No membership yet"}</div>
          <div className="mt-3 text-sm text-muted">Ends</div>
          <div className="text-lg">{fmtDate(m.latestEnd)}</div>
          <div className="mt-3 text-sm text-muted">Outstanding</div>
          <div className={m.outstanding > 0 ? "text-lg font-semibold text-alert" : "text-lg"}>{formatInr(m.outstanding)}</div>
        </Card>
        <Card title="Contact" className="md:col-span-2">
          <dl className="divide-y divide-line text-sm">
            <Row label="Mobile" value={m.phone} />
            <Row label="WhatsApp" value={m.whatsapp ?? m.phone} />
            <Row label="Email" value={m.email} />
            <Row label="Address" value={address} />
            <Row label="Emergency contact" value={m.emergencyName && `${m.emergencyName}${m.emergencyRelation ? ` (${m.emergencyRelation})` : ""} ${m.emergencyPhone ?? ""}`} />
          </dl>
        </Card>
        <Card title="Profile" className="md:col-span-3">
          <dl className="grid divide-line text-sm sm:grid-cols-2 sm:gap-x-8 [&>div]:border-b [&>div]:border-line">
            <Row label="Gender" value={m.gender} />
            <Row label="Date of birth" value={m.dob ? fmtDate(m.dob) : null} />
            <Row label="Occupation" value={m.occupation} />
            <Row label="Source" value={m.source} />
            <Row label="Trainer" value={m.trainerName} />
            <Row label="Joined" value={fmtStamp(m.createdAt)} />
            <Row label="Tags" value={m.tags.length ? <span className="flex flex-wrap justify-end gap-1">{m.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : null} />
          </dl>
          {m.notes && <p className="mt-4 text-sm"><span className="text-muted">Notes: </span>{m.notes}</p>}
          {m.staffNotes && <p className="mt-2 text-sm"><span className="text-muted">Staff notes: </span>{m.staffNotes}</p>}
        </Card>
        {history && (
          <>
            <Card title="Memberships" className="md:col-span-3">
              {history.memberships.length === 0 ? (
                <p className="text-sm text-muted">No memberships yet.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {history.memberships.map((ms) => (
                    <li key={ms.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <span className="font-semibold">{ms.plan.name}</span> · {fmtDate(ms.startDate)} to {fmtDate(ms.endDate)}
                        <span className="text-muted"> · {ms.type === "NEW" ? "New" : ms.type === "RENEWAL" ? "Renewal" : ms.type}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        {ms.status === "CANCELLED" && <Badge tone="alert">Cancelled</Badge>}
                        <Link href={`/invoices/${ms.invoice.id}`} className="text-accent">
                          {ms.invoice.number}
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Invoices" className="md:col-span-2">
              {history.invoices.length === 0 ? (
                <p className="text-sm text-muted">No invoices yet.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {history.invoices.map((inv) => (
                    <li key={inv.id}>
                      <Link href={`/invoices/${inv.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:text-accent">
                        <span>
                          <span className="font-semibold">{inv.number}</span> · {fmtDate(inv.date)} · {formatInr(inv.total)}
                        </span>
                        <InvoiceStatusBadge status={inv.status} overdueDays={inv.overdueDays} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Payments">
              {history.payments.length === 0 ? (
                <p className="text-sm text-muted">No payments yet.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {history.payments.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 py-2">
                      <span className={p.status === "REVERSED" ? "text-muted line-through" : ""}>
                        {formatInr(p.amount)} · {p.method}
                      </span>
                      <span className="text-muted">{fmtDate(p.date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
        <Card title="Workout & diet" className="md:col-span-1">
          {canPrograms ? (
            <AssignForm memberId={m.id} workouts={workouts.filter((w) => w.active || w.id === m.workoutPlanId)} diets={diets.filter((d) => d.active || d.id === m.dietPlanId)} workoutId={m.workoutPlanId} dietId={m.dietPlanId} />
          ) : (
            <dl className="divide-y divide-line text-sm">
              <Row label="Workout" value={workout?.name} />
              <Row label="Diet" value={diet?.name} />
            </dl>
          )}
          {workout && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted">See {workout.name}</summary>
              {workout.days.map((d) => (
                <div key={d.name} className="mt-2">
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-muted">{d.exercises.map((x) => `${x.name} ${x.sets}`).join(" · ")}</p>
                </div>
              ))}
            </details>
          )}
          {diet && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-muted">See {diet.name}</summary>
              {diet.meals.map((x) => (
                <p key={x.name} className="mt-1">
                  <span className="font-semibold">{x.name}:</span> <span className="text-muted">{x.food}</span>
                </p>
              ))}
            </details>
          )}
        </Card>
        <Card title="Progress" className="md:col-span-2">
          {progress.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1 font-medium">Date</th>
                    <th className="py-1 text-right font-medium">Weight</th>
                    <th className="py-1 text-right font-medium">Body fat</th>
                    <th className="py-1 text-right font-medium">Waist</th>
                    <th className="py-1 pl-4 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {progress.map((p, i) => {
                    const prev = progress[i + 1];
                    const delta = p.weightKg != null && prev?.weightKg != null ? p.weightKg - prev.weightKg : null;
                    return (
                      <tr key={p.id}>
                        <td className="py-1.5">{fmtDate(p.date)}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {p.weightKg != null ? `${p.weightKg} kg` : "—"}
                          {delta ? <span className={delta < 0 ? "ml-1 text-ok" : "ml-1 text-muted"}>{delta > 0 ? "+" : ""}{delta.toFixed(1)}</span> : null}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{p.bodyFat != null ? `${p.bodyFat}%` : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{p.waistCm != null ? `${p.waistCm} cm` : "—"}</td>
                        <td className="py-1.5 pl-4 text-muted">{p.notes}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {canPrograms ? <ProgressForm memberId={m.id} today={todayIso()} /> : progress.length === 0 && <p className="text-sm text-muted">No measurements yet.</p>}
        </Card>
        {visits && (
          <Card title="Recent visits" className="md:col-span-2">
            {visits.length === 0 ? (
              <p className="text-sm text-muted">No visits yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {visits.map((v) => (
                  <li key={v.id} className="flex justify-between gap-2 py-2">
                    <span>
                      {fmtDate(v.date)} · {fmtTime(v.checkIn)}
                      {v.checkOut ? ` to ${fmtTime(v.checkOut)}` : ""}
                    </span>
                    <span className="text-muted">
                      {v.method}
                      {v.override ? " · override" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {bookings && (
          <Card title="Classes">
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
                      <span className="text-muted">{b.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
