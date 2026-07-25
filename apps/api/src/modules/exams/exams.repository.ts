import type { ClientSession } from "mongoose";
import type { PublicQuestion } from "@bya/shared";
import { ExamAttemptModel, ExamSessionModel, type ExamSessionDocument } from "./exams.schema.js";

/** Data access for exams. The only file in this module importing Mongoose. */

export async function createSession(
  input: {
    ownerId: string;
    answerKey: number[];
    questions: PublicQuestion[];
  },
  now: Date,
): Promise<{ sessionId: string }> {
  const created = await ExamSessionModel.create({
    ownerId: input.ownerId,
    answerKey: input.answerKey,
    questions: input.questions,
    total: input.answerKey.length,
    used: false,
    createdAt: now,
  });
  return { sessionId: String(created.id) };
}

export async function findSession(sessionId: string): Promise<ExamSessionDocument | null> {
  return ExamSessionModel.findById(sessionId).lean<ExamSessionDocument | null>().exec();
}

/**
 * Consumes a session inside a transaction, but only if it is still unused.
 *
 * The `used: false` precondition is in the query, so two concurrent submits of
 * the same session produce exactly one scored attempt — the second finds
 * nothing to update. Returns whether it won.
 */
export async function consumeSession(
  sessionId: string,
  result: { score: number; passed: boolean },
  session: ClientSession,
  now: Date,
): Promise<boolean> {
  const updated = await ExamSessionModel.findOneAndUpdate(
    { _id: sessionId, used: false },
    { $set: { used: true, usedAt: now, score: result.score, passed: result.passed } },
    { session },
  )
    .lean()
    .exec();

  return updated !== null;
}

export async function recordAttempt(
  input: {
    ownerId: string;
    score: number;
    total: number;
    passed: boolean;
    answersGiven: number[];
    answerKey: number[];
    questions: PublicQuestion[];
  },
  session: ClientSession,
  now: Date,
): Promise<void> {
  await ExamAttemptModel.create([{ ...input, submittedAt: now }], { session });
}

/** Count of this accountant's FAILED attempts since `since`. */
export async function countRecentFails(ownerId: string, since: Date): Promise<number> {
  return ExamAttemptModel.countDocuments({
    ownerId,
    passed: false,
    submittedAt: { $gte: since },
  }).exec();
}

/** The oldest recent failed attempt's timestamp, for computing the next window. */
export async function oldestRecentFail(ownerId: string, since: Date): Promise<Date | null> {
  const doc = await ExamAttemptModel.findOne({
    ownerId,
    passed: false,
    submittedAt: { $gte: since },
  })
    .sort({ submittedAt: 1 })
    .select({ submittedAt: 1 })
    .lean<{ submittedAt: Date } | null>()
    .exec();
  return doc?.submittedAt ?? null;
}

export async function hasPassed(ownerId: string): Promise<boolean> {
  const doc = await ExamAttemptModel.findOne({ ownerId, passed: true })
    .select({ _id: 1 })
    .lean()
    .exec();
  return doc !== null;
}

/** The most recent passing attempt's score, or null if never passed. */
export async function latestPass(
  ownerId: string,
): Promise<{ score: number; total: number } | null> {
  const doc = await ExamAttemptModel.findOne({ ownerId, passed: true })
    .sort({ submittedAt: -1 })
    .select({ score: 1, total: 1 })
    .lean<{ score: number; total: number } | null>()
    .exec();
  return doc === null ? null : { score: doc.score, total: doc.total };
}
