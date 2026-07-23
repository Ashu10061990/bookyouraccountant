import { describe, expect, it } from "vitest";
import golden from "./__fixtures__/legacy-golden.json" with { type: "json" };
import { computePayable } from "./coupon.js";

interface GoldenCoupon {
  name: string;
  quote: { rate: number; total: number };
  applyCoupon: boolean;
  result: { payable: number; couponValue: number };
}

const coupons = golden.coupons as GoldenCoupon[];

describe("computePayable matches the frozen legacy coupon", () => {
  it.each(coupons.map((c) => [c.name, c] as const))("reproduces %s exactly", (_name, gold) => {
    const out = computePayable(
      { ratePaise: gold.quote.rate * 100, totalPaise: gold.quote.total * 100 },
      gold.applyCoupon,
    );

    expect(out.payablePaise).toBe(gold.result.payable * 100);
    expect(out.couponValuePaise).toBe(gold.result.couponValue * 100);
  });

  it("covers the captured coupon cases", () => {
    expect(coupons.length).toBeGreaterThanOrEqual(8);
  });
});

describe("coupon invariants", () => {
  it("charges the full total when the coupon is not applied", () => {
    const out = computePayable({ ratePaise: 180000, totalPaise: 900000 }, false);
    expect(out).toEqual({ payablePaise: 900000, couponValuePaise: 0 });
  });

  it("discounts exactly one day's rate", () => {
    const out = computePayable({ ratePaise: 180000, totalPaise: 900000 }, true);
    expect(out.couponValuePaise).toBe(180000);
    expect(out.payablePaise).toBe(720000);
  });

  // firestore.rules allowed a client-created assignment only at payable == 0.
  // A quote of a single day or less must land there, never below.
  it("makes a one-day-or-less quote fully free, never negative", () => {
    const oneDay = computePayable({ ratePaise: 180000, totalPaise: 180000 }, true);
    expect(oneDay.payablePaise).toBe(0);

    const halfDay = computePayable({ ratePaise: 180000, totalPaise: 90000 }, true);
    expect(halfDay.payablePaise).toBe(0);
    // The coupon is capped at the total, so it never "owes" the business money.
    expect(halfDay.couponValuePaise).toBe(90000);
  });

  it("keeps every figure an integer paise", () => {
    const out = computePayable({ ratePaise: 205000, totalPaise: 1332500 }, true);
    expect(Number.isInteger(out.payablePaise)).toBe(true);
    expect(Number.isInteger(out.couponValuePaise)).toBe(true);
  });
});
