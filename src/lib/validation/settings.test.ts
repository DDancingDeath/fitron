import { describe, expect, it } from "vitest";
import { reminderInput } from "./settings";

const base = { expiryDays: ["15", "0"], dedupDays: "3", dueEveryDays: "0", defaultMonths: "3", graceDays: "5", birthdays: "on" };

describe("reminderInput", () => {
  it("coerces the form and sorts the expiry days descending without repeats", () => {
    expect(reminderInput.parse(base)).toEqual({ expiryDays: [15, 0], dedupDays: 3, dueEveryDays: 0, defaultMonths: 3, graceDays: 5, birthdays: true });
    expect(reminderInput.parse({ ...base, expiryDays: ["0", "15", "7", "15"] }).expiryDays).toEqual([15, 7, 0]);
  });

  it("treats a single pill and no pills correctly, and a missing birthday box as off", () => {
    expect(reminderInput.parse({ ...base, expiryDays: "7" }).expiryDays).toEqual([7]);
    expect(reminderInput.parse({ dedupDays: "3", dueEveryDays: "0", defaultMonths: "3", graceDays: "5" })).toMatchObject({ expiryDays: [], birthdays: false });
  });

  it.each([
    ["expiryDays", "5"],
    ["defaultMonths", "0"],
    ["graceDays", "61"],
    ["dueEveryDays", "31"],
    ["dedupDays", "-1"],
    ["defaultMonths", "2.5"],
  ])("rejects %s = %s", (k, v) => {
    const r = reminderInput.safeParse({ ...base, [k]: v });
    expect(r.success).toBe(false);
    if (!r.success) expect(String(r.error.issues[0]!.path[0])).toBe(k);
  });
});
