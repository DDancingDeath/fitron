/** Where to go after signing in: only paths on this site, never another host. */
export function safeNext(raw: unknown, fallback = "/dashboard") {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\") || /[\r\n]/.test(s)) return fallback;
  if (s === "/" || s.startsWith("/login")) return fallback;
  return s;
}
