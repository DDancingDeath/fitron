import { describe, expect, it } from "vitest";
import { membershipStatus } from "./membership";

const today = "2026-09-27";
const base = { suspended: false, outstanding: 0, today };

describe("membershipStatus", () => {
  it("puts suspension ahead of everything else", () => {
    expect(membershipStatus({ ...base, suspended: true, latestEnd: "2026-08-01", outstanding: 500 })).toBe(
      "SUSPENDED",
    );
  });

  it("is EXPIRED the day after the end date, or with no membership", () => {
    expect(membershipStatus({ ...base, latestEnd: "2026-09-26" })).toBe("EXPIRED");
    expect(membershipStatus({ ...base, latestEnd: null })).toBe("EXPIRED");
  });

  it("is EXPIRING_SOON from the end date back to 7 days before", () => {
    expect(membershipStatus({ ...base, latestEnd: "2026-09-27" })).toBe("EXPIRING_SOON");
    expect(membershipStatus({ ...base, latestEnd: "2026-10-04" })).toBe("EXPIRING_SOON");
    expect(membershipStatus({ ...base, latestEnd: "2026-10-05" })).toBe("ACTIVE");
  });

  it("is PAYMENT_PENDING with a balance and more than 7 days left", () => {
    expect(membershipStatus({ ...base, latestEnd: "2026-12-31", outstanding: 1 })).toBe("PAYMENT_PENDING");
  });
});
