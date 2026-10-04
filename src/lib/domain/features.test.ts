import { describe, expect, it } from "vitest";
import { FEATURES, PERMISSION_FEATURE, PLAN_FEATURES, planFor, planHas, type Feature } from "./features";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PLANS } from "./pricing";

const keys = Object.keys(FEATURES) as Feature[];

describe("plan features", () => {
  it("opens more with each plan, and everything for a hand-made gym", () => {
    const starter = { key: "starter", name: "Starter", custom: false };
    const pro = { key: "professional", name: "Professional", custom: false };
    const ent = { key: "enterprise", name: "Enterprise", custom: false };
    expect(keys.filter((f) => planHas(starter, f))).toEqual([]);
    expect(keys.filter((f) => !planHas(pro, f))).toEqual(["analytics", "roles"]);
    expect(keys.filter((f) => !planHas(ent, f))).toEqual([]);
    expect(planHas({ key: "starter", name: "Starter", custom: true }, "accounting")).toBe(true);
    expect(planHas({ key: "something-old", name: "?", custom: false }, "whatsapp")).toBe(true);
  });

  it("names the cheapest plan that opens a feature", () => {
    expect(planFor("whatsapp")).toEqual({ key: "professional", name: "Professional" });
    expect(planFor("analytics")).toEqual({ key: "enterprise", name: "Enterprise" });
  });

  it("maps every gym plan on the price list, and only real permissions", () => {
    for (const p of PLANS) if (p.product !== "AI_TRAINER") expect(PLAN_FEATURES[p.key], p.key).toBeDefined();
    expect(PERMISSION_FEATURE["payroll.manage"]).toBe("staff");
    for (const k of Object.keys(PERMISSION_FEATURE)) expect(k in PERMISSIONS, k).toBe(true);
    // What Starter keeps: the basics every gym needs to bill and track members.
    const open = (Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).filter((k) => !PERMISSION_FEATURE[k]);
    for (const k of ["members.view", "memberships.renew", "invoices.create", "payments.collect", "expenses.manage", "plans.manage", "settings.manage", "import.run", "audit.view"]) expect(open).toContain(k);
  });
});
