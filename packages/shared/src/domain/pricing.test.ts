import { describe, expect, it } from "vitest";
import golden from "./__fixtures__/legacy-golden.json" with { type: "json" };
import { computeQuote, type QuoteAnswers } from "./pricing.js";
import { BACKLOGS } from "./pricing-options.js";

/**
 * The legacy pricing algorithm is worth real money to get right, and it is not
 * the kind of thing a re-derivation can be trusted to reproduce. So parity is
 * proven against golden vectors — outputs captured from the frozen legacy
 * `computeQuote` by `scripts/gen-golden.mjs` — rather than against expectations
 * a human wrote by reading the algorithm.
 *
 * A transcription slip in any pricing dial, service-meta number or option
 * constant diverges at least one of these eleven cases, which span single vs
 * multi service, monthly vs one-time, backlog near/far, every volume band, site
 * visit, all three experience tiers and each business nature.
 */
interface GoldenQuote {
  name: string;
  answers: QuoteAnswers;
  quote: {
    days: number;
    rate: number;
    baseRate: number;
    discountPct: number;
    total: number;
    cycleDays: number;
    setupDays: number;
    catchupDays: number;
    monthlyDays: number | null;
    monthlyTotal: number | null;
  } | null;
}

const quotes = golden.quotes as GoldenQuote[];

describe("computeQuote matches the frozen legacy engine", () => {
  it.each(quotes.map((q) => [q.name, q] as const))("reproduces %s exactly", (_name, gold) => {
    const result = computeQuote(gold.answers);

    if (gold.quote === null) {
      expect(result).toBeNull();
      return;
    }
    expect(result).not.toBeNull();
    const q = result!;

    // Day counts and the discount ratio carry across unchanged.
    expect(q.days).toBe(gold.quote.days);
    expect(q.cycleDays).toBe(gold.quote.cycleDays);
    expect(q.setupDays).toBe(gold.quote.setupDays);
    expect(q.catchupDays).toBe(gold.quote.catchupDays);
    expect(q.discountPct).toBe(gold.quote.discountPct);
    expect(q.monthlyDays).toBe(gold.quote.monthlyDays);

    // Money is the legacy rupee figure × 100, as integer paise.
    expect(q.ratePaise).toBe(gold.quote.rate * 100);
    expect(q.baseRatePaise).toBe(gold.quote.baseRate * 100);
    expect(q.totalPaise).toBe(gold.quote.total * 100);
    expect(q.monthlyTotalPaise).toBe(
      gold.quote.monthlyTotal === null ? null : gold.quote.monthlyTotal * 100,
    );
  });

  it("covers all eleven captured cases, so none was silently skipped", () => {
    expect(quotes).toHaveLength(11);
  });
});

describe("invariants the legacy relied on", () => {
  it("returns null when no service is selected", () => {
    expect(computeQuote({ serviceIds: [] })).toBeNull();
    expect(computeQuote({})).toBeNull();
  });

  // firestore.rules enforced `total == days * rate` on a client-created
  // (coupon) assignment. That check only holds if the engine keeps the identity.
  it("keeps total === days × rate in paise, the rule's precondition", () => {
    for (const gold of quotes) {
      if (gold.quote === null) continue;
      const q = computeQuote(gold.answers)!;
      expect(q.totalPaise).toBe(Math.round(gold.quote.days * (q.ratePaise / 100)) * 100);
    }
  });

  it("never quotes below the half-day floor or above the 26-day cap", () => {
    for (const gold of quotes) {
      const q = computeQuote(gold.answers);
      if (q === null) continue;
      expect(q.days).toBeGreaterThanOrEqual(0.5);
      expect(q.days).toBeLessThanOrEqual(26);
    }
  });

  it("emits money as whole integer paise everywhere", () => {
    for (const gold of quotes) {
      const q = computeQuote(gold.answers);
      if (q === null) continue;
      expect(Number.isInteger(q.ratePaise)).toBe(true);
      expect(Number.isInteger(q.totalPaise)).toBe(true);
      expect(Number.isInteger(q.baseRatePaise)).toBe(true);
      if (q.monthlyTotalPaise !== null) expect(Number.isInteger(q.monthlyTotalPaise)).toBe(true);
    }
  });

  it("still exposes the full backlog vocabulary (8 bands incl. 6plus)", () => {
    expect(BACKLOGS).toHaveLength(8);
    expect(BACKLOGS.at(-1)?.months).toBe(8);
  });
});
