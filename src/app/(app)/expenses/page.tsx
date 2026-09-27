import { requirePermission } from "@/lib/auth/current";
import { listCategories, listExpenses } from "@/lib/services/expenses";
import { todayIso } from "@/lib/services/time";
import { Badge, Button, Card, Empty, Input, PageHeader, Select } from "@/components/ui";
import { fmtDate, formatInr } from "@/lib/format";
import { ExpenseForm, VoidExpense } from "./expense-form";

export const metadata = { title: "Expenses · Fitron" };

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const u = await requirePermission("expenses.manage");
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const today = todayIso();
  const f = { q: s("q"), categoryId: s("cat"), from: s("from") ?? `${today.slice(0, 7)}-01`, to: s("to") ?? today, includeVoid: s("void") === "1" };
  const [rows, cats] = await Promise.all([listExpenses(u, f), listCategories()]);
  const total = rows.filter((r) => r.status === "ACTIVE").reduce((a, r) => a + r.amount, 0);

  return (
    <>
      <PageHeader title="Expenses" subtitle={`${formatInr(total)} from ${fmtDate(f.from)} to ${fmtDate(f.to)}`} />
      <Card title="Add an expense" className="mb-6">
        <ExpenseForm categories={cats} today={today} />
      </Card>
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto_auto]">
        <Input name="q" defaultValue={f.q} placeholder="Description, vendor or bill no." aria-label="Search" />
        <Select name="cat" defaultValue={f.categoryId ?? ""} aria-label="Category">
          <option value="">Any category</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input name="from" type="date" defaultValue={f.from} aria-label="From" />
        <Input name="to" type="date" defaultValue={f.to} aria-label="To" />
        <label className="flex items-center gap-2 px-2 text-sm">
          <input type="checkbox" name="void" value="1" defaultChecked={f.includeVoid} className="size-4" /> Show voided
        </label>
        <Button>Filter</Button>
      </form>
      {rows.length === 0 ? (
        <Empty>No expenses in this period.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className={r.status === "VOID" ? "block truncate font-semibold text-muted line-through" : "block truncate font-semibold"}>{r.description}</span>
                  <span className="text-sm text-muted">
                    {r.code} · {fmtDate(r.date)} · {r.category.name}
                    {r.vendor ? ` · ${r.vendor}` : ""} · {r.method}
                    {r.status === "VOID" ? ` · voided: ${r.voidReason}` : ""}
                  </span>
                </span>
                {r.status === "VOID" && <Badge tone="alert">Void</Badge>}
                <span className="w-28 text-right font-semibold">{formatInr(r.amount)}</span>
                {r.status === "ACTIVE" && u.can("expenses.void") && <VoidExpense id={r.id} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
