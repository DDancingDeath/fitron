import { getCurrentUser, PLAN_ENDED } from "@/lib/auth/current";
import { listDay } from "@/lib/services/attendance";
import { toCsv } from "@/lib/services/reports";
import { todayIso } from "@/lib/services/time";
import { fmtTime } from "@/lib/format";

/** One day's check-ins, as on the attendance screen. */
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return new Response("Sign in first.", { status: 401 });
  if (u.planBlocked) return new Response(PLAN_ENDED, { status: 402 });
  if (!u.can("attendance.manage")) return new Response("Not allowed.", { status: 403 });
  const d = new URL(req.url).searchParams.get("date");
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayIso();
  const { rows } = await listDay(u, date);
  const csv = toCsv({
    columns: [
      { key: "date", label: "Date" },
      { key: "code", label: "Member ID" },
      { key: "name", label: "Name" },
      { key: "type", label: "Type" },
      { key: "in", label: "Check-in" },
      { key: "out", label: "Check-out" },
      { key: "minutes", label: "Minutes" },
      { key: "method", label: "Method" },
      { key: "branch", label: "Branch" },
    ],
    rows: rows.map((r) => ({
      date,
      code: r.member?.code ?? "",
      name: r.member?.name ?? r.guestName ?? "",
      type: r.type === "GUEST" ? "Guest" : "Member",
      in: fmtTime(r.checkIn),
      out: r.checkOut ? fmtTime(r.checkOut) : "",
      minutes: r.checkOut ? Math.round((+r.checkOut - +r.checkIn) / 60_000) : "",
      method: r.override ? `${r.method} (allowed by staff)` : r.method,
      branch: r.branch.name,
    })),
  });
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="attendance_${date}.csv"`, "Cache-Control": "private, no-store" },
  });
}
