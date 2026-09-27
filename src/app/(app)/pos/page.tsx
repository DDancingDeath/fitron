import { requirePermission } from "@/lib/auth/current";
import { isLow, listProducts } from "@/lib/services/pos";
import { memberOptions } from "@/lib/services/members";
import { getTax } from "@/lib/services/tax";
import { Empty, LinkButton, Notice, PageHeader } from "@/components/ui";
import { Terminal } from "./terminal";

export const metadata = { title: "Counter sale · Fitron" };

export default async function PosPage() {
  const u = await requirePermission("pos.sell");
  const pickBranch = u.branch === "ALL" && u.branchIds.length > 1;
  const [products, members, tax] = await Promise.all([listProducts(u, { activeOnly: true }), memberOptions(u), getTax(u.orgId)]);
  const branchId = u.branch === "ALL" ? u.branchIds[0] : u.branch;
  const here = products.filter((p) => p.branchId === branchId);
  return (
    <>
      <PageHeader
        title="Counter sale"
        subtitle="Supplements, drinks, merchandise and day passes. Paid in full, with a GST invoice."
        actions={u.can("products.manage") ? <LinkButton href="/products">Products & stock</LinkButton> : undefined}
      />
      {pickBranch ? (
        <Notice>Pick a branch at the top of the page first. Each branch sells from its own stock.</Notice>
      ) : here.length === 0 ? (
        <Empty>No products yet.{u.can("products.manage") ? " Add some under Products & stock." : ""}</Empty>
      ) : (
        <Terminal
          taxRate={tax.enabled ? tax.rate : 0}
          members={members}
          products={here.map((p) => ({ id: p.id, name: p.name, category: p.category, price: p.price, stock: p.stock, low: isLow(p), gst: p.gstApplicable }))}
        />
      )}
    </>
  );
}
