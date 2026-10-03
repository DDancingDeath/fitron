import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "./ui";

const btn = "inline-flex min-h-[38px] items-center gap-1.5 rounded-md border px-[18px] text-sm font-semibold whitespace-nowrap";

/** The prototype's modal: a card over a dimmed page; clicking outside closes it. Opened by a URL param, closed by a link. */
export function Dialog({ kicker, title, note, close, error, children }: { kicker: string; title: string; note?: string; close: string; error?: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-5 max-lg:items-end max-lg:p-0">
      <Link href={close} aria-label="Close" className="absolute inset-0 bg-[color-mix(in_srgb,var(--text)_8%,rgba(0,0,0,0.6))]" scroll={false} />
      <div role="dialog" aria-modal="true" className="relative flex w-[min(480px,100%)] flex-col gap-3.5 rounded-lg bg-surface p-5 shadow-lg max-lg:rounded-t-[18px] max-lg:rounded-b-none">
        <div>
          <div className="text-[11px] tracking-[0.1em] text-muted uppercase">{kicker}</div>
          <div className="text-xl font-semibold">{title}</div>
        </div>
        {error && <Notice tone="alert">{error}</Notice>}
        {children}
        {note && <p className="m-0 text-[13px] text-muted">{note}</p>}
      </div>
    </div>
  );
}

export const DialogButtons = ({ close, label }: { close: string; label: string }) => (
  <div className="flex justify-end gap-2.5">
    <Link href={close} className={`${btn} border-line hover:bg-fg/7`} scroll={false}>
      Cancel
    </Link>
    <button className={`${btn} border-transparent bg-accent text-accent-ink hover:bg-accent-hover`}>{label}</button>
  </div>
);
