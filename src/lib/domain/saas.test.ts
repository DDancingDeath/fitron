import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { branchPrice, gstSplit, gymTerms, nextPeriod, planPrice, planStanding, planWritable, reminderSubject, renewalReminder, standings } from "./saas";

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

describe("renewalReminder", () => {
  const paid = (until: string) => ({ kind: "PAID" as const, until });

  it("is quiet for gyms FITRON set up by hand and while a payment is being checked", () => {
    expect(renewalReminder({ kind: "CUSTOM" }, "Professional", "2026-10-03", 7, false)).toBeNull();
    expect(renewalReminder(paid("2026-10-10"), "Professional", "2026-10-03", 7, true)).toBeNull();
  });

  it("warns about the trial when the days left (sign-up day counted) hit the setting, and the day before it ends", () => {
    const trial = { kind: "TRIAL" as const, until: "2026-10-09" };
    const r = renewalReminder(trial, "Professional", "2026-10-03", 7, false);
    expect(r).toMatchObject({ kind: "DUE", daysLeft: 7, until: "2026-10-09" });
    expect(r!.text).toContain("free trial ends in 7 days (9 Oct 2026)");
    expect(renewalReminder(trial, "Professional", "2026-10-04", 7, false)).toBeNull(); // 6 left
    expect(renewalReminder(trial, "Professional", "2026-10-08", 7, false)).toBeNull(); // 2 left
    expect(renewalReminder(trial, "Professional", "2026-10-09", 7, false)!.text).toContain("ends in 1 day");
  });

  it.each([14, 7, 3, 1])("with remindDays %i, a paid plan fires on that day and the day before it ends only", (n) => {
    const until = "2026-10-31";
    for (let d = 0; d <= 20; d++) {
      const today = addDays(until, -d);
      const r = renewalReminder(paid(until), "Enterprise", today, n, false);
      if (d === n || d === 1) {
        expect(r, today).toMatchObject({ kind: "DUE", daysLeft: d });
        expect(r!.text).toContain("Your Enterprise plan ends in");
        expect(r!.text).toContain("Renew to keep everything running");
      } else expect(r, today).toBeNull();
    }
  });

  it("fires once when remindDays is 1", () => {
    const days = Array.from({ length: 10 }, (_, d) => addDays("2026-10-31", -d)).filter((t) => renewalReminder(paid("2026-10-31"), "Starter", t, 1, false));
    expect(days).toEqual(["2026-10-30"]);
  });

  it("speaks on the first day of grace and on the day the gym turns read-only", () => {
    const grace = { kind: "GRACE" as const, until: "2026-10-31", readOnlyFrom: "2026-11-08" };
    expect(renewalReminder(grace, "Starter", "2026-11-01", 7, false)).toMatchObject({ kind: "GRACE" });
    expect(renewalReminder(grace, "Starter", "2026-11-01", 7, false)!.text).toContain("read-only on 8 Nov 2026");
    expect(renewalReminder(grace, "Starter", "2026-11-02", 7, false)).toBeNull();
    const lapsed = { kind: "LAPSED" as const, since: "2026-11-08" };
    expect(renewalReminder(lapsed, "Starter", "2026-11-08", 7, false)).toMatchObject({ kind: "LAPSED" });
    expect(renewalReminder(lapsed, "Starter", "2026-11-09", 7, false)).toBeNull();
  });

  it("makes an email subject from the first sentence", () => {
    expect(reminderSubject("Your Professional plan ends in 7 days (10 Oct 2026). Renew to keep everything running.")).toBe("FITRON: your Professional plan ends in 7 days");
    expect(reminderSubject("Your FITRON plan has ended and the gym is now read-only. Your records are safe.")).toBe("FITRON: your FITRON plan has ended and the gym is now read-only");
  });
});
