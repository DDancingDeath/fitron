import { describe, expect, it } from "vitest";
import { DEFAULT_ACCESS, entryBlock } from "./access";

const today = "2026-09-28";
const ok = { suspended: false, latestEnd: "2026-10-10", outstanding: 0 };

describe("entryBlock", () => {
  it("lets an active member in", () => expect(entryBlock(ok, DEFAULT_ACCESS, today)).toBeNull());
  it("lets a member in on their last day", () => expect(entryBlock({ ...ok, latestEnd: today }, DEFAULT_ACCESS, today)).toBeNull());
  it("blocks a suspended member", () => expect(entryBlock({ ...ok, suspended: true }, DEFAULT_ACCESS, today)).toMatch(/suspended/));
  it("blocks the day after expiry, unless inside the grace days", () => {
    const m = { ...ok, latestEnd: "2026-09-26" };
    expect(entryBlock(m, DEFAULT_ACCESS, today)).toBe("Membership ended 2 days ago");
    expect(entryBlock(m, { ...DEFAULT_ACCESS, graceDays: 2 }, today)).toBeNull();
  });
  it("blocks someone who never had a membership", () => expect(entryBlock({ ...ok, latestEnd: null }, DEFAULT_ACCESS, today)).toMatch(/No membership/));
  it("blocks dues above the limit only when that rule is on", () => {
    const m = { ...ok, outstanding: 150000 };
    expect(entryBlock(m, DEFAULT_ACCESS, today)).toBeNull();
    expect(entryBlock(m, { ...DEFAULT_ACCESS, blockDues: true, duesLimit: 100000 }, today)).toBe("₹1,500 outstanding");
    expect(entryBlock(m, { ...DEFAULT_ACCESS, blockDues: true, duesLimit: 200000 }, today)).toBeNull();
  });
});
