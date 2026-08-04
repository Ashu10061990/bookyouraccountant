import { EXAM_POLICY } from "@bya/shared";
import { describe, expect, it } from "vitest";
import { EXAM_POOL } from "../data/exam-bank.js";
import { drawExam, scoreAttempt, seededRng } from "./exam-engine.helper.js";

describe("drawExam", () => {
  it("draws exactly the per-attempt count", () => {
    const { questions, answerKey } = drawExam(seededRng(1));
    expect(questions).toHaveLength(EXAM_POLICY.questionsPerAttempt);
    expect(answerKey).toHaveLength(EXAM_POLICY.questionsPerAttempt);
  });

  it("serves public questions with four options and no answer field", () => {
    const { questions } = drawExam(seededRng(2));
    for (const q of questions) {
      expect(q.options).toHaveLength(4);
      expect(q).not.toHaveProperty("answer");
      expect(q).not.toHaveProperty("id");
    }
  });

  // The core anti-cheat property. The answerKey is the correct position AFTER
  // the shuffle, so it must actually point at the correct option text.
  it("keeps the answer key pointing at the genuinely correct option", () => {
    const rng = seededRng(3);
    const { questions, answerKey } = drawExam(rng);

    questions.forEach((served, i) => {
      // Find the source question by its (unique) text and confirm the keyed
      // option equals the source's correct option text.
      const source = EXAM_POOL.find((q) => q.q === served.q)!;
      const correctText = source.options[source.answer];
      expect(served.options[answerKey[i]!]).toBe(correctText);
    });
  });

  it("spreads the draw across topics rather than clumping in one", () => {
    // With 11 topics and 20 questions, a stratified draw touches many topics;
    // a naive "first 20 of the pool" would be almost all one topic.
    const { questions } = drawExam(seededRng(4));
    const topics = new Set(
      questions.map((served) => EXAM_POOL.find((q) => q.q === served.q)!.topic),
    );
    expect(topics.size).toBeGreaterThanOrEqual(8);
  });

  it("shuffles: two different seeds give different papers", () => {
    const a = drawExam(seededRng(5));
    const b = drawExam(seededRng(6));
    expect(a.questions.map((q) => q.q)).not.toEqual(b.questions.map((q) => q.q));
  });

  it("is deterministic: the same seed gives the same paper", () => {
    expect(drawExam(seededRng(7))).toEqual(drawExam(seededRng(7)));
  });

  it("never serves the same question twice in one paper", () => {
    const { questions } = drawExam(seededRng(8));
    const texts = questions.map((q) => q.q);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("scoreAttempt", () => {
  it("scores a perfect attempt as a pass", () => {
    const key = [0, 1, 2, 3];
    expect(scoreAttempt(key, [0, 1, 2, 3])).toEqual({ score: 4, total: 4, passed: true });
  });

  it("applies the 75% pass ratio at the boundary", () => {
    const key = [0, 0, 0, 0];
    // 3/4 = 0.75 → pass.
    expect(scoreAttempt(key, [0, 0, 0, 9]).passed).toBe(true);
    // 2/4 = 0.5 → fail.
    expect(scoreAttempt(key, [0, 0, 9, 9]).passed).toBe(false);
  });

  it("scores missing trailing answers as wrong, not as a crash", () => {
    // A timed-out last question arrives short; the engine pads.
    const key = [0, 1, 2, 3];
    expect(scoreAttempt(key, [0, 1])).toEqual({ score: 2, total: 4, passed: false });
  });

  it("scores the not-answered sentinel (-1) as wrong", () => {
    const key = [0, 1, 2, 3];
    expect(scoreAttempt(key, [0, 1, -1, -1]).score).toBe(2);
  });

  it("never passes an empty key", () => {
    expect(scoreAttempt([], [])).toEqual({ score: 0, total: 0, passed: false });
  });

  it("ignores extra answers beyond the served total", () => {
    const key = [0, 1];
    expect(scoreAttempt(key, [0, 1, 0, 0, 0])).toEqual({ score: 2, total: 2, passed: true });
  });
});
