import { describe, expect, it } from "vitest";
import { examPaperSchema, examResultSchema, publicQuestionSchema } from "./exam.js";

/**
 * The client-facing exam shapes must never carry answer information. The bank
 * with its correct answers lives server-side in apps/api; these schemas are
 * what a frontend receives, and the whole security model rests on them saying
 * nothing about which option is right.
 */
describe("public exam shapes leak no answer key", () => {
  it("a public question has options but no answer field", () => {
    const parsed = publicQuestionSchema.parse({
      topic: "GST",
      q: "…",
      options: ["a", "b", "c", "d"],
      // A server bug that tried to attach the answer must be stripped, not passed.
      answer: 2,
      correctPos: 2,
    });

    expect(parsed).not.toHaveProperty("answer");
    expect(parsed).not.toHaveProperty("correctPos");
    expect(Object.keys(parsed).sort()).toEqual(["options", "q", "topic"]);
  });

  it("the exam paper carries a sessionId but no per-question key", () => {
    const paper = examPaperSchema.parse({
      sessionId: "s1",
      questions: [{ topic: "GST", q: "…", options: ["a", "b", "c", "d"], answerKey: [1] }],
      secondsPerQuestion: 30,
      passRatio: 0.75,
      answerKey: [1, 2, 3],
    });

    expect(paper).not.toHaveProperty("answerKey");
    expect(paper.questions[0]).not.toHaveProperty("answerKey");
  });

  it("the result reports a score but never the correct answers", () => {
    const result = examResultSchema.parse({
      score: 15,
      total: 20,
      passed: true,
      answerKey: [1, 2, 3],
    });

    expect(result).not.toHaveProperty("answerKey");
    expect(Object.keys(result).sort()).toEqual(["passed", "score", "total"]);
  });
});
