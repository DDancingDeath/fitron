import { describe, expect, it } from "vitest";
import { branchPrice, gstSplit, gymTerms, nextPeriod, planPrice, planStanding, planWritable, standings } from "./saas";

describe("Fitron branch plan", () => {
  it("prices extra branches and plans from the price list, with 18% GST", () => {
    expect(branchPrice("MONTHLY")).toEqual({ base: 49_900, gst: 8_982, total: 58_882 });
    expect(branchPrice("YEARLY")).toEqual({ base: 4_99_000, gst: 89_820, total: 5_88_820 });
    expect(planPrice("starter", "MONTHLY")).toEqual({ base: 99_900, gst: 17_982, total: 1_17_882 });
    expect(planPrice("enterprise", "YEARLY").base).toBe(39_99_000);
    expect(() => planPrice("ai-pro", "MONTHLY")).toThrow();
  });

  it("sets limits from the plan; gyms set up by hand keep the old rules", () => {
    const trial = new Date("2026-10-08T00:00:00Z");
    expect(gymTerms({ plan: "starter", trialEndsAt: trial })).toEqual({ custom: false, memberLimit: 100, includedBranches: 1, extraBranches: false });
    expect(gymTerms({ plan: "enterprise", trialEndsAt: trial })).toEqual({ custom: false, memberLimit: null, includedBranches: 3, extraBranches: true });
    expect(gymTerms({ plan: "professional", trialEndsAt: null })).toMatchObject({ custom: true, memberLimit: null, includedBranches: 3 });
  });

  it("runs trial, paid, grace, then read-only", () => {
    expect(planStanding(null, null, "2026-10-01")).toEqual({ kind: "CUSTOM" });
    expect(planStanding("2026-10-07", null, "2026-10-07")).toEqual({ kind: "TRIAL", until: "2026-10-07" });
    expect(planStanding("2026-10-07", null, "2026-10-08")).toEqual({ kind: "LAPSED", since: "2026-10-08" });
    expect(planStanding("2026-10-07", "2026-11-07", "2026-10-08")).toEqual({ kind: "PAID", until: "2026-11-07" });
    expect(planStanding("2026-10-07", "2026-11-07", "2026-11-10")).toEqual({ kind: "GRACE", until: "2026-11-07", readOnlyFrom: "2026-11-15" });
    const lapsed = planStanding("2026-10-07", "2026-11-07", "2026-11-15");
    expect(lapsed).toEqual({ kind: "LAPSED", since: "2026-11-15" });
    expect(planWritable(lapsed)).toBe(false);
  });

  it("continues a period without a gap, or starts today after a lapse", () => {
    expect(nextPeriod("MONTHLY", "2026-09-27", null)).toEqual({ start: "2026-09-27", end: "2026-10-26" });
    expect(nextPeriod("YEARLY", "2026-09-27", "2026-10-10")).toEqual({ start: "2026-10-11", end: "2027-10-10" });
    expect(nextPeriod("MONTHLY", "2026-09-27", "2026-09-01")).toEqual({ start: "2026-09-27", end: "2026-10-26" });
  });

  it("includes 3 branches, then paid, grace for 7 days, then read-only", () => {
    const bs = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }));
    const paid = new Map([
      ["d", "2026-09-30"],
      ["e", "2026-09-25"],
      ["f", "2026-09-19"],
    ]);
    const s = standings(bs, paid, "2026-09-27");
    expect(s.get("c")).toEqual({ kind: "INCLUDED" });
    expect(s.get("d")).toEqual({ kind: "PAID", until: "2026-09-30" });
    expect(s.get("e")).toEqual({ kind: "GRACE", until: "2026-09-25", readOnlyFrom: "2026-10-03" });
    expect(s.get("f")).toEqual({ kind: "READ_ONLY", since: "2026-09-27" });
    expect(standings([...bs, { id: "g" }], paid, "2026-09-27").get("g")).toEqual({ kind: "READ_ONLY", since: null });
  });

  it("splits GST by state", () => {
    expect(gstSplit("20ABCDE1234F1Z5", "20XYZAB9876C1Z1", 45_001)).toEqual({ type: "CGST_SGST", cgst: 22_500, sgst: 22_501, igst: 0 });
    expect(gstSplit("20ABCDE1234F1Z5", "29XYZAB9876C1Z1", 45_000).type).toBe("IGST");
    expect(gstSplit("20ABCDE1234F1Z5", null, 45_000).type).toBe("IGST");
  });
});
