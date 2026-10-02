"use client";

import { switchBranch } from "@/app/(app)/actions";

export function BranchSwitcher({ branches, value }: { branches: { id: string; name: string }[]; value: string }) {
  if (branches.length < 2) return null;
  return (
    <form action={switchBranch} className="hidden sm:block">
      <select
        name="branch"
        defaultValue={value}
        aria-label="Branch"
        title="Branch"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="min-h-9 min-w-[170px] rounded-md border border-line bg-surface px-2.5 text-sm text-fg hover:border-fg/45 focus:border-accent focus:outline-none"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
        <option value="ALL">All branches (consolidated)</option>
      </select>
    </form>
  );
}
