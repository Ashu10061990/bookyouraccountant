import { describe, expect, it } from "vitest";
import {
  addPaise,
  assertPaise,
  formatINR,
  paiseToRupees,
  percentageOfPaise,
  rupeesToPaise,
} from "./money.js";

describe("rupeesToPaise", () => {
  it("converts whole rupees", () => {
    expect(rupeesToPaise(100)).toBe(10_000);
  });

  it("converts paise without float drift", () => {
    // 19.99 * 100 === 1998.9999999999998 in raw float arithmetic
    expect(rupeesToPaise(19.99)).toBe(1999);
  });

  it("rounds half away from zero", () => {
    expect(rupeesToPaise(0.005)).toBe(1);
  });

  it("handles zero", () => {
    expect(rupeesToPaise(0)).toBe(0);
  });

  it("rejects non-finite input", () => {
    expect(() => rupeesToPaise(Number.NaN)).toThrow("not a finite number");
    expect(() => rupeesToPaise(Number.POSITIVE_INFINITY)).toThrow("not a finite number");
  });
});

describe("paiseToRupees", () => {
  it("converts back to rupees", () => {
    expect(paiseToRupees(10_000)).toBe(100);
    expect(paiseToRupees(1999)).toBe(19.99);
  });
});

describe("formatINR", () => {
  it("formats with the Indian digit grouping", () => {
    expect(formatINR(12_345_678)).toBe("₹1,23,456.78");
  });

  it("always shows two decimal places", () => {
    expect(formatINR(10_000)).toBe("₹100.00");
  });

  it("formats zero", () => {
    expect(formatINR(0)).toBe("₹0.00");
  });

  it("formats negatives", () => {
    expect(formatINR(-10_000)).toBe("-₹100.00");
  });
});

describe("addPaise", () => {
  it("sums amounts", () => {
    expect(addPaise(100, 200, 300)).toBe(600);
  });

  it("returns zero for no arguments", () => {
    expect(addPaise()).toBe(0);
  });

  it("rejects non-integer input", () => {
    expect(() => addPaise(10.5)).toThrow("must be a safe integer");
  });
});

describe("percentageOfPaise", () => {
  it("computes a percentage", () => {
    // 12% platform fee on ₹10,000
    expect(percentageOfPaise(1_000_000, 0.12)).toBe(120_000);
  });

  it("returns an integer for amounts that do not divide evenly", () => {
    const result = percentageOfPaise(333, 0.12);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(40); // 39.96 rounds to 40
  });

  it("computes the 0.1% TDS rate exactly", () => {
    expect(percentageOfPaise(50_000_000, 0.001)).toBe(50_000);
  });

  it("rejects a rate outside 0..1", () => {
    expect(() => percentageOfPaise(100, 1.5)).toThrow("between 0 and 1");
    expect(() => percentageOfPaise(100, -0.1)).toThrow("between 0 and 1");
  });
});

describe("assertPaise", () => {
  it("accepts integers", () => {
    expect(() => assertPaise(100)).not.toThrow();
  });

  it("rejects fractional values", () => {
    expect(() => assertPaise(10.5)).toThrow("must be a safe integer");
  });

  it("rejects values beyond MAX_SAFE_INTEGER", () => {
    expect(() => assertPaise(Number.MAX_SAFE_INTEGER + 1)).toThrow("must be a safe integer");
  });

  it("accepts MAX_SAFE_INTEGER itself", () => {
    expect(() => assertPaise(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });
});
