import { describe, expect, it } from "vitest";
import { BENEFIT_GROUPS, FAQS, PRICING_TIERS, TESTIMONIALS } from "./marketing.js";
import { CHATBOT_KB } from "./chatbot-kb.js";

/**
 * §19 hand-curated content. Count assertions guard against a partial port the
 * same way they do for the other reference data — losing a testimonial or an
 * FAQ is invisible without them.
 */
describe("marketing copy", () => {
  it("has the twelve benefits the inventory records, across its groups", () => {
    const totalBenefits = BENEFIT_GROUPS.reduce(
      (n, g) =>
        n +
        (Array.isArray((g as { items?: unknown[] }).items)
          ? (g as { items: unknown[] }).items.length
          : 0),
      0,
    );
    expect(totalBenefits).toBe(12);
  });

  it("has 5 FAQs, 3 pricing tiers and 3 testimonials", () => {
    expect(FAQS).toHaveLength(5);
    expect(PRICING_TIERS).toHaveLength(3);
    expect(TESTIMONIALS).toHaveLength(3);
  });

  it("gives every FAQ a question and an answer", () => {
    for (const faq of FAQS as readonly { q: string; a: string }[]) {
      expect(faq.q.length).toBeGreaterThan(0);
      expect(faq.a.length).toBeGreaterThan(0);
    }
  });
});

describe("chatbot knowledge base", () => {
  it("has all 12 entries", () => {
    expect(CHATBOT_KB).toHaveLength(12);
  });

  it("gives every entry keywords and an answer, for keyword matching", () => {
    for (const entry of CHATBOT_KB) {
      expect(entry.id.length, entry.id).toBeGreaterThan(0);
      expect(entry.keywords.length, entry.id).toBeGreaterThan(0);
      expect(entry.a.length, entry.id).toBeGreaterThan(0);
    }
  });

  it("has unique entry ids", () => {
    const ids = CHATBOT_KB.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
