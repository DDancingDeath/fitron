import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { reportList } from "@/lib/services/reports";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Reports · Fitron" };

export default async function ReportsPage() {
  const u = await requirePermission("invoices.view");
  const list = reportList(u);
  const groups = [...new Set(list.map((r) => r.group))];
  return (
    <>
      <PageHeader title="Reports" subtitle="Every report can be downloaded as CSV for Excel." />
      <div className="grid gap-6 md:grid-cols-3">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="mb-2 text-sm font-semibold tracking-wider text-muted uppercase">{g}</h2>
            <ul className="overflow-hidden rounded-xl border border-line bg-surface">
              {list
                .filter((r) => r.group === g)
                .map((r) => (
                  <li key={r.key} className="border-b border-line last:border-0">
                    <Link href={`/reports/${r.key}`} className="block px-4 py-3 hover:bg-surface-2">
                      {r.title}
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
