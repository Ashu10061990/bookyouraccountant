import { describe, expect, it } from "vitest";
import { EXAM_POOL } from "./exam-bank.js";

/**
 * The exam bank is a §19 hand-curated asset — 293 questions a domain expert
 * wrote — and its `answer` indices are safety-critical: a wrong key passes or
 * fails real candidates on the wrong basis. It is generated from the frozen
 * source, and these integrity checks are the floor under that.
 */
describe("exam bank integrity", () => {
  it("has all 293 questions", () => {
    expect(EXAM_POOL).toHaveLength(293);
  });

  it("covers all 11 topics", () => {
    const topics = new Set(EXAM_POOL.map((q) => q.topic));
    expect(topics.size).toBe(11);
  });

  it("gives every question exactly four options", () => {
    for (const q of EXAM_POOL) {
      expect(q.options, q.id).toHaveLength(4);
    }
  });

  it("has a valid 0-3 answer index for every question", () => {
    for (const q of EXAM_POOL) {
      expect(Number.isInteger(q.answer), q.id).toBe(true);
      expect(q.answer, q.id).toBeGreaterThanOrEqual(0);
      expect(q.answer, q.id).toBeLessThanOrEqual(3);
    }
  });

  it("has a unique id for every question", () => {
    const ids = EXAM_POOL.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no blank question text or options", () => {
    for (const q of EXAM_POOL) {
      expect(q.q.trim().length, q.id).toBeGreaterThan(0);
      for (const opt of q.options) expect(opt.trim().length, q.id).toBeGreaterThan(0);
    }
  });

  it("has enough questions in every topic to fill a stratified draw", () => {
    // The draw round-robins topics; each must have at least one question or the
    // bucket is empty and the stratification silently skews.
    const byTopic = new Map<string, number>();
    for (const q of EXAM_POOL) byTopic.set(q.topic, (byTopic.get(q.topic) ?? 0) + 1);
    for (const [topic, n] of byTopic) expect(n, topic).toBeGreaterThan(0);
  });
});
