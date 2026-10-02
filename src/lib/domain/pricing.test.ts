import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLANS, findPlan, rupeesLabel, type PlanDef } from "./pricing";

describe("pricing", () => {
  it("formats rupees the Indian way", () => {
    expect(rupeesLabel(19_99_000)).toBe("₹19,990");
    expect(rupeesLabel(39_99_000)).toBe("₹39,990");
    expect(rupeesLabel(29_950)).toBe("₹299.5");
  });

  it("finds plans by key", () => {
    expect(findPlan("starter")?.memberLimit).toBe(100);
    expect(findPlan("nope")).toBeUndefined();
  });

  it("matches every price shown on the pricing page", () => {
    const page = readFileSync(new URL("../../../public/site/index.html", import.meta.url), "utf8");
    for (const p of PLANS) {
      for (const paise of Object.values(p.price)) expect(page, `${p.name} ${paise}`).toContain(rupeesLabel(paise).slice(1));
    }
  });

  it("shows the same plan cards as the pricing page", () => {
    // The page's HTML may escape characters or wrap text across lines; compare its visible text.
    const page = readFileSync(new URL("../../../public/site/index.html", import.meta.url), "utf8")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&middot;|&#183;/g, "·")
      .replace(/\s+/g, " ");
    const gym: readonly PlanDef[] = PLANS.filter((p) => p.product === "GYM_ACCOUNTING");
    expect(gym.every((p) => p.card)).toBe(true);
    for (const p of gym) for (const line of [p.card!.audience, p.card!.limit, ...(p.card!.includes ? [p.card!.includes] : []), ...p.card!.features]) expect(page, `${p.name}: ${line}`).toContain(line);
  });

  it("links every trial button on the pricing page to a real plan", () => {
    const page = readFileSync(new URL("../../../public/site/index.html", import.meta.url), "utf8");
    const keys = [...page.matchAll(/href="\/signup\?plan=([a-z-]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(5);
    for (const k of keys) expect(findPlan(k), k).toBeDefined();
  });
});
