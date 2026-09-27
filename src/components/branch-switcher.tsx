"use client";

import { switchBranch } from "@/app/(app)/actions";

export function BranchSwitcher({ branches, value }: { branches: { id: string; name: string }[]; value: string }) {
  if (branches.length < 2) return <span className="text-sm text-muted">{branches[0]?.name}</span>;
  return (
    <form action={switchBranch}>
      <label className="sr-only" htmlFor="branch">
        Branch
      </label>
      <select
        id="branch"
        name="branch"
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="min-h-9 rounded-md border border-line bg-surface px-2 text-sm"
      >
        <option value="ALL">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </form>
  );
}
