import { describe, expect, it } from "vitest";
import golden from "./__fixtures__/legacy-payout-golden.json" with { type: "json" };
import { PAYOUT_RATES } from "../reference/payout-rates.js";
import { computePayout, financialYearKey } from "./payout.js";

interface GoldenPayout {
  name: string;
  grossRupees: number;
  priorFyGrossRupees: number;
  isGstRegistered: boolean;
  legacy: {
    gross: number;
    fee: number;
    gstOnFee: number;
    tds: number;
    gstTcs: number;
    net: number;
    fyGrossAfter: number;
  };
}

const vectors = golden as GoldenPayout[];
const R = 100; // rupees → paise

describe("computePayout reproduces the legacy statutory maths exactly", () => {
  // §14.5: the payout engine is the migration gate. "Re-run against migrated
  // data produces byte-identical output; a single-rupee difference blocks the
  // flip." These vectors are the legacy rupee figures; the port must give each
  // × 100, with the same whole-rupee rounding — not the finer paise rounding a
  // naive port would produce.
  it.each(vectors.map((v) => [v.name, v] as const))("matches %s to the rupee", (_name, gold) => {
    const out = computePayout({
      grossPaise: gold.grossRupees * R,
      priorFyGrossPaise: gold.priorFyGrossRupees * R,
      isGstRegistered: gold.isGstRegistered,
    });

    expect(out.feePaise).toBe(gold.legacy.fee * R);
    expect(out.gstOnFeePaise).toBe(gold.legacy.gstOnFee * R);
    expect(out.tdsPaise).toBe(gold.legacy.tds * R);
    expect(out.gstTcsPaise).toBe(gold.legacy.gstTcs * R);
    expect(out.netPaise).toBe(gold.legacy.net * R);
    expect(out.fyGrossAfterPaise).toBe(gold.legacy.fyGrossAfter * R);
  });

  it("covers all eleven captured cases", () => {
    expect(vectors).toHaveLength(11);
  });
});

describe("the rounding decision that the golden guards", () => {
  // The exact boundary that separates rupee-granular from paise-granular
  // rounding, above the min-fee floor so the floor does not mask it.
  it("rounds the fee to whole rupees, not to paise", () => {
    // ₹8342 × 12% = ₹1001.04 → ₹1001, not ₹1001.04.
    const out = computePayout({
      grossPaise: 8342 * R,
      priorFyGrossPaise: 0,
      isGstRegistered: false,
    });
    expect(out.feePaise).toBe(1001 * R);

    // ₹8346 × 12% = ₹1001.52 → ₹1002.
    const up = computePayout({
      grossPaise: 8346 * R,
      priorFyGrossPaise: 0,
      isGstRegistered: false,
    });
    expect(up.feePaise).toBe(1002 * R);
  });

  it("emits every line as a whole-rupee multiple of 100 paise", () => {
    for (const gold of vectors) {
      const out = computePayout({
        grossPaise: gold.grossRupees * R,
        priorFyGrossPaise: gold.priorFyGrossRupees * R,
        isGstRegistered: gold.isGstRegistered,
      });
      for (const v of [
        out.feePaise,
        out.gstOnFeePaise,
        out.tdsPaise,
        out.gstTcsPaise,
        out.netPaise,
      ]) {
        expect(v % 100).toBe(0);
      }
    }
  });
});

describe("payout invariants", () => {
  it("nets to zero on a fully coupon-covered (zero-gross) engagement", () => {
    const out = computePayout({ grossPaise: 0, priorFyGrossPaise: 0, isGstRegistered: true });
    expect(out).toMatchObject({
      feePaise: 0,
      gstOnFeePaise: 0,
      tdsPaise: 0,
      gstTcsPaise: 0,
      netPaise: 0,
    });
  });

  it("floors the fee at minFeePaise for a small engagement", () => {
    // ₹1000 × 12% = ₹120 < ₹200 floor.
    const out = computePayout({
      grossPaise: 1000 * R,
      priorFyGrossPaise: 0,
      isGstRegistered: false,
    });
    expect(out.feePaise).toBe(PAYOUT_RATES.minFeePaise);
  });

  it("charges no TDS below the ₹5L FY threshold", () => {
    const out = computePayout({
      grossPaise: 400000 * R,
      priorFyGrossPaise: 0,
      isGstRegistered: false,
    });
    expect(out.tdsPaise).toBe(0);
  });

  it("charges TDS only on the portion of gross that crosses ₹5L", () => {
    // Prior ₹4L + this ₹2L = ₹6L; ₹1L crosses the line; TDS = 0.1% of ₹1L = ₹100.
    const out = computePayout({
      grossPaise: 200000 * R,
      priorFyGrossPaise: 400000 * R,
      isGstRegistered: false,
    });
    expect(out.tdsPaise).toBe(100 * R);
  });

  it("charges GST TCS only to a registered accountant", () => {
    const base = { grossPaise: 100000 * R, priorFyGrossPaise: 0 };
    expect(computePayout({ ...base, isGstRegistered: true }).gstTcsPaise).toBe(500 * R);
    expect(computePayout({ ...base, isGstRegistered: false }).gstTcsPaise).toBe(0);
  });

  it("keeps net = gross − every deduction", () => {
    const out = computePayout({
      grossPaise: 550000 * R,
      priorFyGrossPaise: 0,
      isGstRegistered: true,
    });
    expect(out.netPaise).toBe(
      out.grossPaise - out.feePaise - out.gstOnFeePaise - out.tdsPaise - out.gstTcsPaise,
    );
  });

  it("never returns a negative net", () => {
    // A pathological fee/deduction stack must clamp at zero, as the legacy did.
    const out = computePayout({ grossPaise: 100, priorFyGrossPaise: 0, isGstRegistered: true });
    expect(out.netPaise).toBeGreaterThanOrEqual(0);
  });
});

describe("financialYearKey", () => {
  // April starts the Indian FY. Passed a date rather than reading the clock,
  // so it stays pure.
  it("puts April–December in the year-to-next-year FY", () => {
    expect(financialYearKey(new Date("2026-04-01"))).toBe("2026-2027");
    expect(financialYearKey(new Date("2026-12-31"))).toBe("2026-2027");
  });

  it("puts January–March in the previous-year FY", () => {
    expect(financialYearKey(new Date("2026-03-31"))).toBe("2025-2026");
    expect(financialYearKey(new Date("2026-01-01"))).toBe("2025-2026");
  });
});
