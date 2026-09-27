import { headers } from "next/headers";
import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { listDevices, recentAccess } from "@/lib/services/biometric";
import { Badge, Button, Card, Empty, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { fmtStamp, fmtTime } from "@/lib/format";
import Link from "next/link";
import { openDoorAction, removeDeviceAction, saveDeviceAction, syncAction } from "./actions";

export const metadata = { title: "Door devices · Fitron" };

const online = (d: Date | null) => !!d && Date.now() - d.getTime() < 5 * 60_000;

export default async function DevicesPage({ searchParams }: PageProps<"/settings/devices">) {
  const u = await requirePermission("settings.manage");
  const sp = await searchParams;
  const [devices, log, branches] = await Promise.all([listDevices(u), recentAccess(u, 40), db.branch.findMany({ where: { id: { in: u.branchIds } }, orderBy: { createdAt: "asc" } })]);
  const host = (await headers()).get("host") ?? "your-fitron-domain";
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Door devices"
        subtitle="Fingerprint and face readers (ZKTeco, eSSL and other ADMS models) that let members in."
        actions={
          devices.length > 0 && (
            <form action={syncAction}>
              <Button>Sync members now</Button>
            </form>
          )
        }
      />
      {typeof sp.saved === "string" && sp.saved && <div className="mb-4"><Notice tone="ok">{sp.saved}</Notice></div>}
      {typeof sp.error === "string" && <div className="mb-4"><Notice tone="alert">{sp.error}</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {devices.length === 0 ? (
            <Empty>No devices yet. Add one with the form.</Empty>
          ) : (
            devices.map((d) => (
              <Card
                key={d.id}
                title={d.name ?? d.serial}
                action={online(d.lastSeenAt) ? <Badge tone="ok">Online</Badge> : <Badge>{d.lastSeenAt ? `Last seen ${fmtStamp(d.lastSeenAt)} ${fmtTime(d.lastSeenAt)}` : "Never called in"}</Badge>}
              >
                <p className="text-sm text-muted">
                  Serial {d.serial} · {branchName(d.branchId)} · door opens {d.relaySeconds}s{d.ip ? ` · ${d.ip}` : ""}
                  {d.queued ? ` · ${d.queued} command${d.queued === 1 ? "" : "s"} waiting` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={openDoorAction.bind(null, d.id)}>
                    <Button variant="primary">Open door</Button>
                  </form>
                  <form action={removeDeviceAction.bind(null, d.id)}>
                    <ConfirmButton variant="danger" confirm="Remove this device? It stops letting members in until it is added again.">
                      Remove
                    </ConfirmButton>
                  </form>
                </div>
              </Card>
            ))
          )}
          <Card title="Recent entries">
            {log.length === 0 ? (
              <p className="text-sm text-muted">No punches yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {log.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {l.member ? <Link href={`/members/${l.member.id}`} className="hover:text-accent">{l.member.name}</Link> : `PIN ${l.pin}`}
                      <span className="text-muted">
                        {" "}
                        · {fmtStamp(l.at)} {fmtTime(l.at)} · {l.method} · {l.device?.name ?? l.device?.serial}
                        {l.reason ? ` · ${l.reason}` : ""}
                      </span>
                    </span>
                    <Badge tone={l.result === "ALLOWED" ? "ok" : l.result === "DENIED" ? "alert" : "neutral"}>{l.result === "ALLOWED" ? "Let in" : l.result === "DENIED" ? "Refused" : "Unknown"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card title="Add or edit a device">
            <form action={saveDeviceAction} className="flex flex-col gap-3">
              <Field label="Serial number" hint="On the label, or Menu → System info → Device info.">
                <Input name="serial" required placeholder="e.g. CQUJ224760123" />
              </Field>
              <Field label="Name">
                <Input name="name" required placeholder="Main door" />
              </Field>
              <Field label="Branch">
                <Select name="branchId" defaultValue={u.branch === "ALL" ? branches[0]?.id : u.branch}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Door open time (seconds)">
                <Input name="relaySeconds" type="number" min={1} max={60} defaultValue={5} />
              </Field>
              <div>
                <Button variant="primary">Save device</Button>
              </div>
            </form>
          </Card>
          <Card title="Connect the device">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>On the device: Menu → Comm. → Cloud Server Setting (ADMS).</li>
              <li>
                Server address <code>{host}</code>, port 443 with HTTPS on (or 80 if the model has no HTTPS).
              </li>
              <li>Save and restart the device. It calls in within a minute.</li>
              <li>Add its serial here. Members with an active plan are loaded onto it, and anyone who expires is removed each morning.</li>
            </ol>
            <p className="mt-2 text-sm text-muted">Enrol fingerprints or faces from each member&apos;s profile, after taking their written consent.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
