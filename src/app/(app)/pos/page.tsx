import Link from "next/link";
import { PlusIcon, ShoppingCartIcon } from "@phosphor-icons/react/dist/ssr";
import { requirePermission } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { isLow, listProducts } from "@/lib/services/pos";
import { memberOptions } from "@/lib/services/members";
import { getTax } from "@/lib/services/tax";
import { fromIso, todayIso } from "@/lib/services/time";
import { addDays } from "@/lib/domain/dates";
import { LinkButton, Notice, TABLE, TD, TH, TR, cx } from "@/components/ui";
import { Tag } from "@/components/tag";
import { formatRupees } from "@/lib/format";
import { Terminal } from "./terminal";

export const metadata = { title: "POS & inventory · Fitron" };

export default async function PosPage() {
  const u = await requirePermission("pos.sell");
  const pickBranch = u.branch === "ALL" && u.branchIds.length > 1;
  const canManage = u.can("products.manage");
  const [products, members, tax] = await Promise.all([listProducts(u, { activeOnly: true }), memberOptions(u), getTax(u.orgId)]);
  const branchId = u.branch === "ALL" ? u.branchIds[0] : u.branch;
  const here = products.filter((p) => p.branchId === branchId);
  const sold = await db.invoiceItem.groupBy({
    by: ["productId"],
    where: { productId: { in: products.map((p) => p.id) }, invoice: { status: "ISSUED", date: { gte: fromIso(addDays(todayIso(), -30)) } } },
    _sum: { qty: true },
  });
  const soldOf = new Map(sold.map((s) => [s.productId, s._sum.qty ?? 0]));
  const multi = u.branchIds.length > 1;

  return (
    <div className="flex flex-col gap-7 pt-4">
      <div>
        <div className="text-[11px] tracking-[0.1em] text-muted uppercase">Front desk sales · stock updates automatically</div>
        <h1 className="mt-1 text-[28px] lg:text-[40px]">POS &amp; inventory</h1>
      </div>
      {pickBranch ? (
        <Notice>Pick a branch at the top of the page to sell. Each branch sells from its own stock.</Notice>
      ) : here.length === 0 ? (
        <p className="text-sm text-muted">No products yet.{canManage ? " Add one under Inventory below." : ""}</p>
      ) : (
        <Terminal
          taxRate={tax.enabled ? tax.rate : 0}
          members={members}
          products={here.map((p) => ({ id: p.id, sku: p.sku, name: p.name, category: p.category, price: p.price, stock: p.stock, low: isLow(p), gst: p.gstApplicable }))}
        />
      )}

      <section>
        <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-xl">Inventory</h3>
          <div className="flex flex-wrap gap-2">
            {u.can("purchases.manage") && (
              <LinkButton href="/purchases/new" variant="primary">
                <ShoppingCartIcon size={16} weight="duotone" />
                Purchase stock
              </LinkButton>
            )}
            {canManage && (
              <LinkButton href="/products/new">
                <PlusIcon size={16} weight="duotone" />
                New product
              </LinkButton>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className={cx(TABLE, "min-w-[900px]")}>
            <thead>
              <tr>
                <th className={TH}>SKU</th>
                <th className={TH}>Product</th>
                <th className={TH}>Category</th>
                {["Price", "Cost", "In stock", "Reorder at", "Sold (30 d)"].map((h) => (
                  <th key={h} className={cx(TH, "text-right")}>
                    {h}
                  </th>
                ))}
                <th className={TH}>Status</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className={TR}>
                  <td className={cx(TD, "whitespace-nowrap")}>{p.sku}</td>
                  <td className={TD}>
                    {canManage ? (
                      <Link href={`/products/${p.id}`} className="hover:text-accent">
                        {p.name}
                      </Link>
                    ) : (
                      p.name
                    )}
                    {multi && <div className="text-xs text-muted">{p.branch.name}</div>}
                  </td>
                  <td className={TD}>{p.category}</td>
                  <td className={cx(TD, "text-right")}>{formatRupees(p.price)}</td>
                  <td className={cx(TD, "text-right")}>{formatRupees(p.cost)}</td>
                  <td className={cx(TD, "text-right")}>{p.stock ?? "—"}</td>
                  <td className={cx(TD, "text-right")}>{p.reorderLevel ?? "—"}</td>
                  <td className={cx(TD, "text-right")}>{soldOf.get(p.id) ?? 0}</td>
                  <td className={TD}>
                    <Tag label={p.stock === null ? "Service" : isLow(p) ? "Low stock" : "In stock"} />
                  </td>
                  <td className={cx(TD, "text-right")}>
                    {canManage && p.stock !== null && (
                      <LinkButton href={`/products/${p.id}#stock`} variant="ghost">
                        Restock
                      </LinkButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
