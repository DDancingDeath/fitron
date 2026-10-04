import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "default" | "danger" | "ghost";
// The prototype's .btn classes: primary (gold), secondary (hairline border), ghost (gold text), plus danger.
const btn: Record<Variant, string> = {
  primary: "border border-transparent px-[18px] bg-accent text-accent-ink hover:bg-accent-hover",
  default: "border border-line px-[18px] text-fg hover:bg-fg/7 active:bg-fg/14",
  danger: "border border-alert/50 px-[18px] text-alert hover:bg-alert-soft",
  ghost: "border border-transparent px-1.5 text-accent hover:bg-accent/10",
};
const btnBase =
  "inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md text-sm leading-tight font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45";

export function Button({ variant = "default", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(btnBase, btn[variant], className)} {...p} />;
}

export function LinkButton({ variant = "default", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(btnBase, btn[variant], className)} {...p} />;
}

const inputCls =
  "w-full min-h-9 rounded-md border border-line bg-surface px-2.5 py-1.5 text-fg caret-accent placeholder:text-fg/65 hover:border-fg/45 focus:border-accent focus:outline-none disabled:opacity-60";

export const Input = ({ className, ...p }: ComponentProps<"input">) => <input className={cx(inputCls, className)} {...p} />;
export const Select = ({ className, ...p }: ComponentProps<"select">) => <select className={cx(inputCls, className)} {...p} />;
export const Textarea = ({ className, ...p }: ComponentProps<"textarea">) => (
  <textarea className={cx(inputCls, "min-h-20", className)} {...p} />
);

export function Field({ label, error, hint, children, className }: { label: ReactNode; error?: string[]; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex flex-col gap-[5px] text-sm", className)}>
      <span className="text-xs text-fg/70">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted">{hint}</span>}
      {error?.map((e) => (
        <span key={e} className="text-xs text-alert">
          {e}
        </span>
      ))}
    </label>
  );
}

export function Card({ className, children, title, action, id }: { className?: string; children: ReactNode; title?: string; action?: ReactNode; id?: string }) {
  return (
    <section id={id} className={cx("rounded-lg border border-line bg-surface px-[22px] py-5 shadow-sm", className)}>
      {(title || action) && (
        <div className="mb-3.5 flex items-center justify-between gap-3">
          {title && <h2 className="text-[17px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = "neutral" | "accent" | "alert" | "ok";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent-strong",
  alert: "bg-alert-soft text-alert-strong",
  ok: "bg-ok-soft text-ok",
};
// The prototype's .tag: small, nearly square chips.
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-sm px-2.5 py-[3px] text-[11px] tracking-[0.02em] whitespace-nowrap", tones[tone])}>{children}</span>;
}

/** Page title as in the prototype: a small uppercase kicker above a large serif heading. */
export function PageHeader({ title, kicker, subtitle, actions }: { title: string; kicker?: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 pt-3">
      <div>
        {kicker && <div className="mb-1 text-[11px] tracking-[0.1em] text-muted uppercase">{kicker}</div>}
        <h1 className="text-[28px] leading-[1.15] font-semibold lg:text-[40px] lg:leading-[1.1]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ tone = "accent", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={cx("rounded-md px-3.5 py-2.5 text-sm", tones[tone])}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">{children}</div>;
}

export { cx };

// The prototype's .table: uppercase small headers, hairline rows, a faint hover.
export const TABLE = "w-full border-collapse text-sm";
export const TH = "border-b border-line p-2.5 text-left text-[11px] font-normal tracking-[0.08em] whitespace-nowrap text-fg/60 uppercase";
export const TD = "border-b border-line-soft p-2.5 align-middle";
export const TR = "hover:bg-fg/4";

/** "Showing 1–12 of 64" with Previous and Next, as under every prototype list. */
export function Pager({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  if (!total) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const btn = "inline-flex min-h-[38px] items-center rounded-md border border-line px-[18px] text-sm font-semibold";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-[13px] text-muted">
        Showing {start}–{end} of {total}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={cx(btn, "hover:bg-fg/7")}>
            Previous
          </Link>
        ) : (
          <span className={cx(btn, "opacity-45")}>Previous</span>
        )}
        {end < total ? (
          <Link href={href(page + 1)} className={cx(btn, "hover:bg-fg/7")}>
            Next
          </Link>
        ) : (
          <span className={cx(btn, "opacity-45")}>Next</span>
        )}
      </div>
    </div>
  );
}

/** The prototype's joined filter buttons; the picked one is gold. */
export function Segmented({ options, current }: { options: { key: string; label: ReactNode; href: string }[]; current: string }) {
  return (
    <div className="inline-flex flex-wrap self-start overflow-hidden rounded-md border border-line">
      {options.map((o) => (
        <Link key={o.key} href={o.href} className={cx("px-3 py-[7px] text-[13px]", o.key === current ? "bg-accent text-accent-ink" : "text-fg hover:bg-fg/7")}>
          {o.label}
        </Link>
      ))}
    </div>
  );
}

/** A small uppercase label over a large figure, as in the prototype's stat rows. */
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "alert" }) {
  return (
    <div>
      <div className="text-[11px] tracking-[0.08em] text-muted uppercase">{label}</div>
      <div className={cx("text-[26px] font-semibold", tone === "alert" && "text-alert")}>{value}</div>
    </div>
  );
}

/** Kicker + 40px title + actions, the header every prototype list page uses. */
export function ListHeader({ kicker, title, actions }: { kicker?: ReactNode; title: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <div className="text-[11px] tracking-[0.1em] text-muted uppercase">{kicker}</div>}
        <h1 className="mt-1 text-[28px] lg:text-[40px]">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </div>
  );
}

export const SEARCH = "min-h-9 max-w-[360px] flex-[1_1_240px] rounded-md border border-line bg-surface px-2.5 py-1.5 text-fg placeholder:text-fg/65 hover:border-fg/45 focus:border-accent focus:outline-none";
