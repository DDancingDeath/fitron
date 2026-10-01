import { describe, expect, it } from "vitest";
import { safeNext } from "./next";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/invoices/abc?x=1")).toBe("/invoices/abc?x=1");
  });
  it("refuses other hosts and odd values", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "", null, "dashboard", "/login?next=/x", "/"]) expect(safeNext(bad)).toBe("/dashboard");
  });
});
