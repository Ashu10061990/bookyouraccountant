import type { PublicQuestion } from "@bya/shared";
import mongoose, { type Model } from "mongoose";

/**
 * `examSessions` — the per-attempt answer key. Feature inventory §17: written
 * by the server, **read by nobody**. The legacy `firestore.rules` gave it
 * `allow read, write: if false` for exactly one reason: it holds the correct
 * answers, and reading it would reveal them.
 *
 * There is deliberately no API route that returns a session document. It is
 * read back only inside the exam service, to score. Storing it in Mongo rather
 * than in memory is what makes `submitExam` survive a server restart between
 * serving the paper and receiving the answers.
 */
export interface ExamSessionDocument {
  ownerId: string;
  /** Correct option position per served question, after the shuffle. */
  answerKey: number[];
  /** The public questions served, kept for the attempt's audit trail. */
  questions: PublicQuestion[];
  total: number;
  used: boolean;
  usedAt?: Date;
  score?: number;
  passed?: boolean;
  createdAt: Date;
}

const publicQuestion = new mongoose.Schema<PublicQuestion>(
  {
    topic: { type: String, required: true },
    q: { type: String, required: true },
    options: { type: [String], required: true },
  },
  { _id: false },
);

const sessionSchema = new mongoose.Schema<ExamSessionDocument>(
  {
    ownerId: { type: String, required: true, index: true },
    answerKey: { type: [Number], required: true },
    questions: { type: [publicQuestion], required: true },
    total: { type: Number, required: true },
    used: { type: Boolean, required: true, default: false },
    usedAt: { type: Date, required: false },
    score: { type: Number, required: false },
    passed: { type: Boolean, required: false },
    createdAt: { type: Date, required: true, default: (): Date => new Date() },
  },
  { collection: "examSessions" },
);

/**
 * `examAttempts` — one per submitted sitting. Feature inventory §17: written by
 * the server, read by the owner and admin. It records what the candidate
 * answered against the served key, so an admin can verify the scoring question
 * by question.
 */
export interface ExamAttemptDocument {
  ownerId: string;
  score: number;
  total: number;
  passed: boolean;
  answersGiven: number[];
  answerKey: number[];
  questions: PublicQuestion[];
  submittedAt: Date;
}

const attemptSchema = new mongoose.Schema<ExamAttemptDocument>(
  {
    ownerId: { type: String, required: true, index: true },
    score: { type: Number, required: true },
    total: { type: Number, required: true },
    passed: { type: Boolean, required: true, index: true },
    answersGiven: { type: [Number], required: true },
    answerKey: { type: [Number], required: true },
    questions: { type: [publicQuestion], required: true },
    submittedAt: { type: Date, required: true, default: (): Date => new Date() },
  },
  { collection: "examAttempts" },
);

// The throttle query: this accountant's recent attempts, by time.
attemptSchema.index({ ownerId: 1, submittedAt: -1 });

export const ExamSessionModel: Model<ExamSessionDocument> =
  (mongoose.models["ExamSession"] as Model<ExamSessionDocument> | undefined) ??
  mongoose.model<ExamSessionDocument>("ExamSession", sessionSchema);

export const ExamAttemptModel: Model<ExamAttemptDocument> =
  (mongoose.models["ExamAttempt"] as Model<ExamAttemptDocument> | undefined) ??
  mongoose.model<ExamAttemptDocument>("ExamAttempt", attemptSchema);
