import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { IMPORT_KINDS, IMPORTS, type ImportKind } from "@/lib/domain/import";
import { getMigration, getOpening } from "@/lib/services/importer";
import { Badge, Card, Notice, PageHeader, cx } from "@/components/ui";
import { SETTINGS_TABS, SectionTabs } from "@/components/section-tabs";
import { fmtStamp } from "@/lib/format";
import { todayIso } from "@/lib/services/time";
import { ImportWizard, OpeningForm, SourceForm } from "./import-forms";

export const metadata = { title: "Migrate & import · Fitron" };

export default async function ImportPage({ searchParams }: PageProps<"/settings/import">) {
  const u = await requirePermission("import.run");
  const { step } = await searchParams;
  const [mig, opening] = await Promise.all([getMigration(u.orgId), getOpening(u.orgId)]);
  const kind = (IMPORT_KINDS as readonly string[]).includes(String(step)) ? (step as ImportKind) : null;
  const branch = u.branch === "ALL" ? null : u.branches.find((b) => b.id === u.branch);
  const steps = [...IMPORT_KINDS.map((k) => [k, IMPORTS[k].label, IMPORTS[k].blurb] as const), ["opening", "Opening balances", "Cash in hand and bank balance on the day you switch, so the cash and bank books start right."] as const];
  return (
    <>
      <PageHeader title="Migrate & import" subtitle="Bring members, payments, expenses, stock and equipment from your old software or Excel." />
      <SectionTabs u={u} tabs={SETTINGS_TABS} current="/settings/import" />
      <Card className="mb-6">
        <SourceForm source={mig.source ?? ""} />
      </Card>
      <ol className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map(([k, label, blurb], i) => {
          const done = mig.done?.[k as ImportKind];
          return (
            <li key={k}>
              <Link href={`/settings/import?step=${k}`} className={cx("block h-full rounded-xl border bg-surface p-4 hover:border-accent", (kind ?? step) === k ? "border-accent" : "border-line")}>
                <span className="flex items-center justify-between gap-2">
                  <strong>
                    {i + 1}. {label}
                  </strong>
                  {done && <Badge tone="ok">{k === "opening" ? "Set" : `${done.n} imported`}</Badge>}
                </span>
                <span className="mt-1 block text-sm text-muted">{blurb}</span>
                {done && <span className="mt-1 block text-xs text-muted">Last {fmtStamp(new Date(done.at))}</span>}
              </Link>
            </li>
          );
        })}
      </ol>
      {kind && (
        <Card title={IMPORTS[kind].label}>
          {!branch ? (
            <Notice>Pick a branch in the header first. Imported records go to that branch.</Notice>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted">
                Importing into {branch.name}. Excel users: save the sheet as CSV first. Dates can be 05-08-2026, 05/08/26, 2026-08-05 or 5 Aug 2026.
                {kind === "payments" && " Only import receipts that aren't already counted in the members sheet's paid amount, or they'll be counted twice."}
              </p>
              <ImportWizard kind={kind} />
            </>
          )}
        </Card>
      )}
      {step === "opening" && (
        <Card title="Opening balances">
          <OpeningForm v={opening} today={todayIso()} />
        </Card>
      )}
      <p className="mt-6 text-sm text-muted">Need help moving? Email support@fitron.in with your export and we&apos;ll do it for you, free, within two working days.</p>
    </>
  );
}
