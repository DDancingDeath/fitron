import { describe, expect, it } from "vitest";
import { assetInfo, depSchedule, depreciationIn, disposalsIn, fyOf, scheduleByFy, type AssetLike } from "./assets";

const treadmill: AssetLike = { cost: 12_000_000, salvage: 0, method: "WDV", rate: 15, life: null, purchaseDate: "2026-06-10" };

describe("depreciation", () => {
  it("financial years run April to March", () => {
    expect(fyOf("2026-03")).toBe(2025);
    expect(fyOf("2026-04")).toBe(2026);
  });

  it("WDV charges rate/12 of the FY opening value each month, counting the purchase month, and re-bases in April", () => {
    const s = depSchedule(treadmill, "2027-04");
    expect(s[0]).toMatchObject({ ym: "2026-06", dep: 150_000 });
    // June 2026 to March 2027 is 10 months at the same base.
    expect(s.filter((r) => r.fy === 2026).every((r) => r.dep === 150_000)).toBe(true);
    const aprilBase = 12_000_000 - 10 * 150_000;
    expect(s.find((r) => r.ym === "2027-04")!.dep).toBe(Math.round((aprilBase * 0.15) / 12));
  });

  it("SLM is (cost − salvage) ÷ months of life and never goes below salvage", () => {
    const pc: AssetLike = { cost: 6_000_000, salvage: 600_000, method: "SLM", rate: null, life: 3, purchaseDate: "2024-01-05" };
    const s = depSchedule(pc, "2030-01");
    expect(s[0]!.dep).toBe(150_000);
    expect(s.reduce((t, r) => t + r.dep, 0)).toBe(5_400_000);
    expect(s.at(-1)!.nbv).toBe(600_000);
    expect(s.filter((r) => r.dep > 0)).toHaveLength(36);
  });

  it("stops after the disposal month and reports the gain or loss against book value", () => {
    const sold = { ...treadmill, disposedOn: "2026-08-20", disposedFor: 11_000_000 };
    const info = assetInfo(sold, "2027-01");
    expect(info.sch.map((r) => r.ym)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(info.nbv).toBe(12_000_000 - 450_000);
    expect(info.gain).toBe(11_000_000 - 11_550_000);
    expect(disposalsIn([sold], "2026-08-01", "2026-08-31")).toEqual({ gain: 0, loss: 550_000 });
    expect(disposalsIn([sold], "2026-09-01", "2026-09-30")).toEqual({ gain: 0, loss: 0 });
  });

  it("imported assets continue from the switch month after the depreciation already charged", () => {
    const old: AssetLike = { ...treadmill, purchaseDate: "2023-05-01", accDepCarried: 4_000_000, depFrom: "2026-09" };
    const s = depSchedule(old, "2026-10");
    expect(s.map((r) => r.ym)).toEqual(["2026-09", "2026-10"]);
    expect(s[0]!.dep).toBe(100_000);
    expect(assetInfo(old, "2026-10").acc).toBe(4_200_000);
  });

  it("sums a period and groups by financial year", () => {
    expect(depreciationIn([treadmill], "2026-07", "2026-09")).toBe(450_000);
    const fy = scheduleByFy(treadmill, "2027-05");
    expect(fy.map((r) => r.fy)).toEqual([2026, 2027]);
    expect(fy[0]).toMatchObject({ opening: 12_000_000, dep: 1_500_000, closing: 10_500_000 });
    expect(fy[1]!.opening).toBe(10_500_000);
  });
});
