import { z } from "zod";

/**
 * Client-facing exam shapes — feature inventory §11.
 *
 * These are the ONLY exam shapes a frontend sees. There is deliberately no
 * answer key here: the 293-question bank with its correct answers lives in
 * `apps/api` (server-only), and `packages/shared` is imported by both
 * frontends. A public question carries the shuffled options and nothing that
 * says which is right.
 */

/** A question as served to the candidate — no correct-answer information. */
export const publicQuestionSchema = z.object({
  topic: z.string(),
  q: z.string(),
  options: z.array(z.string()).length(4),
});

/** The exam paper handed to the client. `sessionId` ties answers back to the
 * server-held key; the key itself never leaves the server. */
export const examPaperSchema = z.object({
  sessionId: z.string(),
  questions: z.array(publicQuestionSchema),
  secondsPerQuestion: z.number().int().positive(),
  passRatio: z.number().min(0).max(1),
});

/** What the candidate submits: their chosen option index per question. */
export const examSubmissionSchema = z.object({
  sessionId: z.string().min(1),
  // -1 means "not answered" (a timed-out question); anything else is a choice.
  answers: z.array(z.number().int().min(-1).max(3)),
});

/** The result the server computes and returns. Never a per-question key. */
export const examResultSchema = z.object({
  score: z.number().int().min(0),
  total: z.number().int().min(0),
  passed: z.boolean(),
  alreadySubmitted: z.boolean().optional(),
});

export type PublicQuestion = z.infer<typeof publicQuestionSchema>;
export type ExamPaper = z.infer<typeof examPaperSchema>;
export type ExamSubmission = z.infer<typeof examSubmissionSchema>;
export type ExamResult = z.infer<typeof examResultSchema>;

/** Exam policy constants, ported from the legacy engine. Public — knowing the
 * pass mark or attempt limit reveals nothing exploitable. */
export const EXAM_POLICY = {
  /** Questions served per attempt, drawn stratified across topics. */
  questionsPerAttempt: 20,
  /** Fraction correct required to pass. */
  passRatio: 0.75,
  /** Seconds allowed per question. */
  secondsPerQuestion: 30,
  /** Maximum failed attempts allowed within the rolling window. */
  maxFailsPerWindow: 2,
  /** The rolling window for attempt throttling, in days. */
  windowDays: 180,
} as const;
