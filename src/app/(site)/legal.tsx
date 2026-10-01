import type { ReactNode } from "react";

/** Long-form policy page: title, last-updated line, then sections with anchor ids. */
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-semibold sm:text-5xl">{title}</h1>
      <p className="mt-3 text-sm text-muted">Last updated {updated}</p>
      <div className="mt-6 text-lg text-muted">{intro}</div>
      <div className="mt-10 flex flex-col gap-10 leading-relaxed [&_a]:text-accent [&_a]:underline [&_h2]:mb-3 [&_h2]:scroll-mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
    </article>
  );
}
