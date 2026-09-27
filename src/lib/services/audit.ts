import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** Rule 10: every write to core tables leaves an audit row in the same transaction. */
export async function audit(
  tx: Tx,
  a: { orgId: string; userId: string | null; action: string; entity: string; entityId: string; before?: unknown; after?: unknown },
) {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    userAgent = h.get("user-agent");
  } catch {
    // Outside a request (seed, jobs).
  }
  await tx.auditLog.create({
    data: {
      orgId: a.orgId,
      userId: a.userId,
      actorType: a.userId ? "USER" : "SYSTEM",
      action: a.action,
      entity: a.entity,
      entityId: a.entityId,
      before: a.before === undefined ? undefined : (JSON.parse(JSON.stringify(a.before)) as Prisma.InputJsonValue),
      after: a.after === undefined ? undefined : (JSON.parse(JSON.stringify(a.after)) as Prisma.InputJsonValue),
      ip,
      userAgent,
    },
  });
}
