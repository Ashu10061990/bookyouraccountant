import { EXAM_POLICY, type ExamPaper, type ExamResult, type ExamSubmission } from "@bya/shared";
import type { RequestContext } from "../middlewares/auth.middleware.js";
import { badRequest, forbidden, notFound } from "../errors/app-error.js";
import { drawExam, scoreAttempt, type Rng } from "../helpers/exam-engine.helper.js";
import * as repository from "../repositories/exams.repository.js";
import { startDbSession, type ClientSession } from "../repositories/transactions.repository.js";

/**
 * The exam service — feature inventory §11.
 *
 * Orchestrates the pure engine and the server-only session store while holding
 * the security model together: the answer key is stored where no client can
 * read it, scoring happens here against that stored key, and a pass is
 * cross-checked against the throttle before a new paper is ever served.
 */

/** Called inside the submit transaction when an attempt passes. Injected so
 * this module does not depend on the accountants module. */
export type OnExamPass = (
  ownerId: string,
  score: number,
  total: number,
  session: ClientSession,
) => Promise<void>;

const windowMs = EXAM_POLICY.windowDays * 24 * 60 * 60 * 1000;

/**
 * Serves a fresh exam paper, after enforcing the attempt throttle.
 *
 * The candidate must be an accountant (the route enforces the role). The paper
 * is drawn, its answer key persisted to a session the client cannot read, and
 * only the public questions returned.
 *
 * `rng` and `now` are injected for determinism — `now` because this codebase's
 * runtimes forbid an argless `new Date()` in shared logic, and passing it keeps
 * the throttle window testable.
 */
export async function startExam(ctx: RequestContext, rng: Rng, now: Date): Promise<ExamPaper> {
  await assertNotThrottled(ctx.uid, now);

  const { questions, answerKey } = drawExam(rng);
  const { sessionId } = await repository.createSession(
    {
      ownerId: ctx.uid,
      answerKey,
      questions,
    },
    now,
  );

  return {
    sessionId,
    questions,
    secondsPerQuestion: EXAM_POLICY.secondsPerQuestion,
    passRatio: EXAM_POLICY.passRatio,
  };
}

/**
 * Scores a submission against the stored key and records the attempt.
 *
 * Idempotent: resubmitting a used session returns its stored result rather than
 * scoring twice, so a double-tap or retry is safe. Everything — consume the
 * session, write the attempt, mark the accountant verified on a pass — commits
 * in one transaction, so a crash mid-submit never leaves a scored session with
 * no attempt, or a verified accountant with no record of why.
 */
export async function submitExam(
  ctx: RequestContext,
  submission: ExamSubmission,
  now: Date,
  onPass?: OnExamPass,
): Promise<ExamResult> {
  const stored = await repository.findSession(submission.sessionId);
  if (stored === null) throw notFound("Exam session not found or expired.");
  if (stored.ownerId !== ctx.uid) throw forbidden("That exam session is not yours.");

  // Already submitted → return the stored result. The score lives on the
  // session, so this needs no second query and cannot be re-scored.
  if (stored.used) {
    return {
      score: stored.score ?? 0,
      total: stored.total,
      passed: stored.passed ?? false,
      alreadySubmitted: true,
    };
  }

  if (stored.total === 0) throw badRequest("Exam session has no questions.");

  const { score, total, passed } = scoreAttempt(stored.answerKey, submission.answers);

  // Pad the recorded answers to the served length so the audit trail lines up
  // with the key question-for-question.
  const answersGiven = Array.from({ length: total }, (_unused, i) => submission.answers[i] ?? -1);

  const dbSession = await startDbSession();
  try {
    await dbSession.withTransaction(async () => {
      const won = await repository.consumeSession(
        submission.sessionId,
        { score, passed },
        dbSession,
        now,
      );

      // Lost the race: another submit of this session already scored it. Do not
      // write a second attempt.
      if (!won) return;

      await repository.recordAttempt(
        {
          ownerId: ctx.uid,
          score,
          total,
          passed,
          answersGiven,
          answerKey: stored.answerKey,
          questions: stored.questions,
        },
        dbSession,
        now,
      );

      if (passed && onPass !== undefined) {
        await onPass(ctx.uid, score, total, dbSession);
      }
    });
  } finally {
    await dbSession.endSession();
  }

  return { score, total, passed };
}

/**
 * Enforces the legacy attempt policy: at most `maxFailsPerWindow` failed
 * attempts in a rolling window, tied to the OTP identity. A further attempt
 * unlocks only when the older failure leaves the window.
 *
 * A candidate who has already passed is not re-throttled — but the route
 * layer decides whether to let them retake at all.
 */
async function assertNotThrottled(ownerId: string, now: Date): Promise<void> {
  const since = new Date(now.getTime() - windowMs);
  const fails = await repository.countRecentFails(ownerId, since);

  if (fails >= EXAM_POLICY.maxFailsPerWindow) {
    const oldest = await repository.oldestRecentFail(ownerId, since);
    const nextMs = (oldest?.getTime() ?? now.getTime()) + windowMs;

    throw forbidden(
      `You have used ${String(EXAM_POLICY.maxFailsPerWindow)} exam attempts in the last ` +
        `${String(EXAM_POLICY.windowDays)} days. Your next attempt opens on ` +
        `${new Date(nextMs).toISOString().slice(0, 10)}.`,
    );
  }
}

/** Has this accountant ever passed? Consumed by the accountants module so a
 * profile created after passing is born verified. */
export function hasPassed(ownerId: string): Promise<boolean> {
  return repository.hasPassed(ownerId);
}
