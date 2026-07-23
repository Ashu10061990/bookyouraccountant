import { describe, expect, it } from "vitest";
import { serviceSchema } from "../schemas/service.js";
import { platformFeesSchema } from "../schemas/config.js";
import { CITIES_BY_STATE, INDIA_STATES } from "./india.js";
import { PAYOUT_RATES } from "./payout-rates.js";
import { ACCOUNTING_SOFTWARE, COMPLIANCE_SOFTWARE, PROFILE_SERVICES } from "./profile-options.js";
import { EXAM_CENTERS, SERVICES } from "./services.js";

/**
 * These are count assertions, and they are the point of the file.
 *
 * Every dataset here is hand-curated by a domain expert; losing part of one is
 * expensive to notice and expensive to redo. Silently porting 120 of 161 cities
 * looks exactly like porting all of them, right up until a business in a
 * missing city cannot register. A count is the cheapest check that fails when
 * a port is partial.
 *
 * If one of these ever fails, the data is wrong — fix the data, never the
 * number.
 */
describe("service catalogue", () => {
  // Inventory §17.2: the legacy client's FALLBACK_SERVICES contains ONE service
  // while the pricing engine, SOP templates, booking validator and seed script
  // all define SEVEN.
  it("has all seven services, not the one the legacy fallback shipped", () => {
    expect(SERVICES).toHaveLength(7);
    expect(SERVICES.map((s) => s.id)).toEqual([
      "bookkeeping",
      "tax",
      "payroll",
      "gst",
      "statements",
      "advisory",
      "audit",
    ]);
  });

  it("every service satisfies the schema the API will validate against", () => {
    for (const service of SERVICES) {
      expect(serviceSchema.safeParse(service).success).toBe(true);
    }
  });

  it("has six exam centres", () => {
    expect(EXAM_CENTERS).toHaveLength(6);
  });
});

describe("india", () => {
  it("has all 36 states and union territories", () => {
    expect(INDIA_STATES).toHaveLength(36);
  });

  // NOTE: 161, not the 466 claimed by FEATURE-INVENTORY.md §19. Both copies of
  // the legacy india.js (repo root and bya-new/src/lib) are byte-identical and
  // contain 161. The inventory figure is wrong; recorded in PARITY-CHECKLIST.md
  // rather than silently reconciled, because the inventory is the parity
  // contract and an error in it needs correcting at the source.
  it("has 161 cities, matching the legacy source exactly", () => {
    expect(Object.values(CITIES_BY_STATE).flat()).toHaveLength(161);
  });

  it("gives every state a city list, so no state dead-ends in the UI", () => {
    for (const state of INDIA_STATES) {
      expect(CITIES_BY_STATE[state], `no cities for ${state}`).toBeDefined();
      expect(CITIES_BY_STATE[state]?.length).toBeGreaterThan(0);
    }
  });

  it("lists no city under a state that does not exist", () => {
    const states = new Set<string>(INDIA_STATES);
    for (const key of Object.keys(CITIES_BY_STATE)) {
      expect(states.has(key), `${key} is not in INDIA_STATES`).toBe(true);
    }
  });
});

describe("software catalogues", () => {
  it("has 11 accounting and 11 compliance tools", () => {
    expect(ACCOUNTING_SOFTWARE).toHaveLength(11);
    expect(COMPLIANCE_SOFTWARE).toHaveLength(11);
  });

  // The shared vocabulary is what makes matching work at all: if the business
  // side and the accountant side drew from different lists, "accountant knows
  // Tally" and "business uses Tally" would be unrelated strings.
  it("offers an 'other' escape hatch on both lists", () => {
    expect(ACCOUNTING_SOFTWARE.some((o) => o.value === "other")).toBe(true);
    expect(COMPLIANCE_SOFTWARE.some((o) => o.value === "other")).toBe(true);
  });

  it("has no duplicate values, which would silently merge two options", () => {
    for (const list of [ACCOUNTING_SOFTWARE, COMPLIANCE_SOFTWARE, PROFILE_SERVICES]) {
      const values = list.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe("the two service vocabularies", () => {
  // Not a bug to fix here — a product decision to surface. Recorded so that
  // whoever settles spec §18 Q3 can see exactly what disagrees.
  it("documents that the profile list and the catalogue disagree", () => {
    const catalogue = new Set<string>(SERVICES.map((s) => s.id));
    const profile = new Set<string>(PROFILE_SERVICES.map((o) => o.value));

    const onlyInProfile = [...profile].filter((id) => !catalogue.has(id));
    const onlyInCatalogue = [...catalogue].filter((id) => !profile.has(id));

    expect(onlyInProfile).toEqual(["tds", "itr", "roc", "einvoicing", "other"]);
    expect(onlyInCatalogue).toEqual(["tax", "statements"]);
  });
});

describe("payout rates", () => {
  // Ported from PAYOUT_DEFAULTS in the legacy functions/index.js. A drift here
  // is a drift in what accountants are actually paid.
  it("matches the legacy statutory values exactly", () => {
    expect(PAYOUT_RATES.takeRate).toBe(0.12);
    expect(PAYOUT_RATES.gstOnFeeRate).toBe(0.18);
    expect(PAYOUT_RATES.tdsRate).toBe(0.001);
    expect(PAYOUT_RATES.gstTcsRate).toBe(0.005);
  });

  it("converts the rupee amounts to paise once, at the boundary", () => {
    expect(PAYOUT_RATES.minFeePaise).toBe(200 * 100);
    expect(PAYOUT_RATES.tdsThresholdPaise).toBe(500_000 * 100);
  });

  it("satisfies the schema an admin override must also satisfy", () => {
    expect(platformFeesSchema.safeParse(PAYOUT_RATES).success).toBe(true);
  });
});
