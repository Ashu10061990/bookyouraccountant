import { describe, expect, it } from "vitest";
import { ECONOMICS } from "../reference/marketing.js";
import { computeEconomics, inr } from "./marketing-economics.js";

describe("computeEconomics", () => {
  it("computes the loaded full-time cost against on-demand", () => {
    const e = computeEconomics(45000, 10);
    // 45000 * 1.18 * 12 loaded; 1200 * 10 * 12 on-demand.
    expect(e.loadedYearly).toBe(45000 * 1.18 * 12);
    expect(e.onDemandYearly).toBe(1200 * 10 * 12);
    expect(e.savingYearly).toBe(e.loadedYearly - e.onDemandYearly);
  });

  it("never shows a negative saving", () => {
    // Many booked days at a low salary can flip the sign; it clamps at zero.
    expect(
      computeEconomics(ECONOMICS.minSalary, ECONOMICS.maxDays).savingYearly,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("inr", () => {
  it("formats in the Indian grouping", () => {
    expect(inr(637200)).toBe("₹6,37,200");
    expect(inr(1200)).toBe("₹1,200");
  });
});
