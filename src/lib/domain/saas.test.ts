import { describe, expect, it } from "vitest";
import { branchPrice, gstSplit, nextPeriod, standings } from "./saas";

describe("Fitron branch plan", () => {
  it("prices extra branches with 18% GST", () => {
    expect(branchPrice("MONTHLY")).toEqual({ base: 250_000, gst: 45_000, total: 295_000 });
    expect(branchPrice("YEARLY")).toEqual({ base: 800_000, gst: 144_000, total: 944_000 });
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
