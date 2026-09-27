import { getCurrentUser } from "@/lib/auth/current";
import { getInvoice } from "@/lib/services/billing";
import { getSetting } from "@/lib/services/settings";
import { getTax } from "@/lib/services/tax";
import { renderInvoicePdf } from "@/lib/pdf/invoice";
import { fmtDate } from "@/lib/format";
import { INVOICE_STATUS_LABEL } from "@/components/invoice-status";

export async function GET(_req: Request, ctx: RouteContext<"/invoices/[id]/pdf">) {
  const u = await getCurrentUser();
  if (!u) return new Response("Sign in first.", { status: 401 });
  if (!u.can("invoices.view")) return new Response("Not allowed.", { status: 403 });
  const { id } = await ctx.params;
  const inv = await getInvoice(u, id);
  if (!inv) return new Response("Not found.", { status: 404 });
  const [gym, tax] = await Promise.all([getSetting<{ name?: string }>(u.orgId, "gym"), getTax(u.orgId)]);
  const m = inv.member;

  const pdf = await renderInvoicePdf({
    gym: { name: gym?.name ?? inv.org.name, address: inv.branch.address, phone: inv.branch.phone, gstin: inv.branch.gstin, sac: tax.sac },
    number: inv.number,
    date: fmtDate(inv.date),
    dueDate: fmtDate(inv.dueDate),
    status: INVOICE_STATUS_LABEL[inv.status],
    member: { name: m.name, code: m.code, phone: m.phone, address: [m.house, m.area, m.city, m.state, m.pin].filter(Boolean).join(", ") },
    items: inv.items.map((i) => ({ ...i, taxRate: Number(i.taxRate) })),
    subtotal: inv.subtotal,
    discount: inv.discount,
    tax: inv.tax,
    total: inv.total,
    paid: inv.paid,
    balance: inv.balance,
    gstType: inv.gstType,
    gstRate: inv.gstRate ? Number(inv.gstRate) : null,
    payments: inv.payments.map((p) => ({ code: p.code, date: fmtDate(p.date), method: p.method, amount: p.amount, reversed: p.status === "REVERSED" })),
    membership: inv.membership ? { plan: inv.membership.plan.name, start: fmtDate(inv.membership.startDate), end: fmtDate(inv.membership.endDate) } : null,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
