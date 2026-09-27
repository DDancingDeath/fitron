import { describe, expect, it } from "vitest";
import { indianPhone, rupees } from "./common";
import { memberInput } from "./member";
import { planInput } from "./plan";

describe("indianPhone", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["98765 43210", "9876543210"],
    ["+91 98765-43210", "9876543210"],
    ["09876543210", "9876543210"],
  ])("normalises %s", (input, out) => {
    expect(indianPhone.parse(input)).toBe(out);
  });

  it.each(["12345", "5876543210", "98765432100"])("rejects %s", (input) => {
    expect(indianPhone.safeParse(input).success).toBe(false);
  });
});

describe("rupees", () => {
  it("turns rupee text into paise", () => {
    expect(rupees.parse("1,499")).toBe(149900);
    expect(rupees.parse("₹ 1499.5")).toBe(149950);
    expect(rupees.safeParse("abc").success).toBe(false);
    expect(rupees.safeParse("1.234").success).toBe(false);
  });
});

describe("memberInput", () => {
  const base = { name: "Priya Sharma", gender: "Female", phone: "9876543210", source: "Walk-in" };

  it("accepts the minimum and turns blanks into undefined", () => {
    const m = memberInput.parse({ ...base, email: "", dob: "", pin: "", whatsapp: "", tags: "" });
    expect(m).toMatchObject({ name: "Priya Sharma", phone: "9876543210", tags: [] });
    expect(m.email).toBeUndefined();
    expect(m.dob).toBeUndefined();
  });

  it("splits tags and checks PIN codes", () => {
    expect(memberInput.parse({ ...base, tags: "morning, pt ,," }).tags).toEqual(["morning", "pt"]);
    expect(memberInput.safeParse({ ...base, pin: "8270" }).success).toBe(false);
  });
});

describe("planInput", () => {
  it("parses prices in rupees and the GST checkbox", () => {
    const p = planInput.parse({ name: "Quarterly", kind: "Membership", months: "3", price: "4,000", regFee: "", discount: "", gstApplicable: "on", features: "Locker\n\nDiet chart" });
    expect(p).toMatchObject({ months: 3, price: 400000, regFee: 0, discount: 0, gstApplicable: true, features: ["Locker", "Diet chart"] });
    expect(planInput.parse({ name: "X Plan", kind: "Membership", months: "1", price: "1" }).gstApplicable).toBe(false);
  });
});
