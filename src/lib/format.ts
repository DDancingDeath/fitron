export { formatInr } from "@/lib/domain/billing";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-27" or a Date → "27 Sep 2026" */
export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const s = typeof d === "string" ? d : d.toISOString().slice(0, 10);
  const [y, m, day] = s.split("-");
  return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
