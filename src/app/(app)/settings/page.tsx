import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/services/settings";
import { getTax } from "@/lib/services/tax";
import { Button, Card, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import { saveAccess, saveBranchAction, saveGym, saveNumbering, saveTax } from "./actions";
import { getAccessRules } from "@/lib/services/attendance";

export const metadata = { title: "Settings · Fitron" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const u = await requirePermission("settings.manage");
  const sp = await searchParams;
  const [gym, tax, numbering, branches, access] = await Promise.all([
    getSetting<{ name?: string }>(u.orgId, "gym"),
    getTax(u.orgId),
    getSetting<{ memberPrefix?: string; invoicePrefix?: string; paymentPrefix?: string }>(u.orgId, "numbering"),
    db.branch.findMany({ where: { orgId: u.orgId }, orderBy: { createdAt: "asc" } }),
    getAccessRules(u.orgId),
  ]);

  return (
    <>
      <PageHeader title="Settings" />
      {typeof sp.saved === "string" && <div className="mb-4"><Notice tone="ok">Saved.</Notice></div>}
      {typeof sp.error === "string" && <div className="mb-4"><Notice tone="alert">{sp.error}</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Gym">
          <form action={saveGym} className="flex flex-col gap-3">
            <Field label="Gym name (shown on invoices)">
              <Input name="name" defaultValue={gym?.name ?? u.orgName} required />
            </Field>
            <div>
              <Button variant="primary">Save</Button>
            </div>
          </form>
        </Card>
        <Card title="GST">
          <form action={saveTax} className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={tax.enabled} className="size-4" /> Charge GST on invoices
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Rate (%)">
                <Input name="rate" type="number" step="0.01" min={0} max={28} defaultValue={tax.rate} />
              </Field>
              <Field label="Type">
                <Select name="type" defaultValue={tax.type}>
                  <option value="CGST+SGST">CGST + SGST</option>
                  <option value="IGST">IGST</option>
                </Select>
              </Field>
              <Field label="SAC code">
                <Input name="sac" defaultValue={tax.sac} />
              </Field>
            </div>
            <p className="text-xs text-muted">Changes apply to new invoices only.</p>
            <div>
              <Button variant="primary">Save</Button>
            </div>
          </form>
        </Card>
        <Card title="Numbering">
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
        </Card>
        <Card title="Entry rules">
          <form action={saveAccess} className="flex flex-col gap-3 text-sm">
            <p className="text-muted">Who the front desk (and later the door device) turns away. Staff can still let someone in with a reason, which is logged.</p>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="blockSuspended" defaultChecked={access.blockSuspended} className="size-4" /> Block suspended members
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="blockExpired" defaultChecked={access.blockExpired} className="size-4" /> Block expired memberships after
              <Input name="graceDays" type="number" min={0} max={60} defaultValue={access.graceDays} className="w-20!" aria-label="Grace days" /> days
            </label>
            <label className="flex flex-wrap items-center gap-2">
              <input type="checkbox" name="blockDues" defaultChecked={access.blockDues} className="size-4" /> Block when dues are over ₹
              <Input name="duesLimit" inputMode="decimal" defaultValue={access.duesLimit / 100} className="w-28!" aria-label="Dues limit" />
            </label>
            <div>
              <Button variant="primary">Save</Button>
            </div>
          </form>
        </Card>
        <Card title="Branches" className="lg:col-span-2">
          <div className="flex flex-col gap-6">
            {[...branches, null].map((b) => (
              <form key={b?.id ?? "new"} action={saveBranchAction.bind(null, b?.id ?? null)} className="grid gap-3 border-b border-line pb-6 last:border-0 last:pb-0 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr_1fr_auto] lg:items-end">
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
        </Card>
      </div>
    </>
  );
}
