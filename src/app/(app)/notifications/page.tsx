import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current";
import { listNotifications, markAllRead } from "@/lib/services/notifications";
import { Button, Empty, PageHeader } from "@/components/ui";
import { fmtStamp, fmtTime } from "@/lib/format";

export const metadata = { title: "Alerts · Fitron" };

async function readAll() {
  "use server";
  const u = await requireUser();
  await markAllRead(u);
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  const u = await requireUser();
  const list = await listNotifications(u);
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle={unread ? `${unread} unread` : "All caught up"}
        actions={
          unread > 0 ? (
            <form action={readAll}>
              <Button>Mark all read</Button>
            </form>
          ) : undefined
        }
      />
      {list.length === 0 ? (
        <Empty>No alerts yet. Low stock, waitlist moves and overridden check-ins show up here.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {list.map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-2 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`} />
                <span className="min-w-0 flex-1">
                  {n.link ? (
                    <Link href={n.link} className={n.readAt ? "hover:text-accent" : "font-semibold hover:text-accent"}>
                      {n.text}
                    </Link>
                  ) : (
                    <span className={n.readAt ? "" : "font-semibold"}>{n.text}</span>
                  )}
                  <span className="block text-sm text-muted">
                    {fmtStamp(n.createdAt)} · {fmtTime(n.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
