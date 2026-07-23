import { EXAM_POLICY, type PublicQuestion } from "@bya/shared";
import { EXAM_POOL, type ExamQuestion } from "./exam-bank.js";

/**
 * The pure exam engine — feature inventory §11, ported from the legacy
 * `getExam` / `submitExam` core.
 *
 * Everything here is pure and deterministic given its RNG. The randomness (the
 * stratified draw and the option shuffle) is injected, so tests run against a
 * seeded generator and production against `Math.random`. The engine touches no
 * database; persisting the answer key and reading it back to score is the
 * service layer's job.
 *
 * ## The security model this preserves
 *
 * The inventory calls the legacy exam model "well designed", and the design is
 * entirely about the answer key never reaching the client:
 *
 * - Options are shuffled per attempt, so "the answer is always B" cannot leak.
 * - The correct position *after* the shuffle is computed here and kept in the
 *   `answerKey`, which the service stores in a session no client can read.
 * - The candidate is served only `PublicQuestion`s — text and shuffled options,
 *   no answer.
 * - Scoring compares the candidate's chosen positions to the stored key; the
 *   client's claim about its own score is never trusted, because it never sends
 *   one.
 */

/** A source of randomness in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

/** One drawn question: what the candidate sees, plus the server-only key. */
export interface DrawnExam {
  questions: PublicQuestion[];
  /** Correct option position per served question, after the shuffle. Server-only. */
  answerKey: number[];
}

/** Fisher-Yates shuffle into a new array, driven by the injected RNG. */
function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const ai = a[i]!;
    const aj = a[j]!;
    a[i] = aj;
    a[j] = ai;
  }
  return a;
}

/**
 * Draws one exam: a stratified sample across topics with each question's
 * options shuffled.
 *
 * Stratified so every attempt spans the whole skill set instead of clumping
 * into whichever topic has the most questions — the draw round-robins through
 * shuffled topic buckets until it has `questionsPerAttempt`.
 */
export function drawExam(
  rng: Rng,
  pool: readonly ExamQuestion[] = EXAM_POOL,
  count: number = EXAM_POLICY.questionsPerAttempt,
): DrawnExam {
  const byTopic = new Map<string, ExamQuestion[]>();
  for (const q of pool) {
    const bucket = byTopic.get(q.topic) ?? [];
    bucket.push(q);
    byTopic.set(q.topic, bucket);
  }

  // Shuffle the topic order and each bucket, then round-robin.
  const buckets = shuffle([...byTopic.keys()], rng).map((topic) =>
    shuffle(byTopic.get(topic)!, rng),
  );

  const picked: ExamQuestion[] = [];
  let bi = 0;
  while (picked.length < count && buckets.some((b) => b.length > 0)) {
    const bucket = buckets[bi % buckets.length]!;
    const next = bucket.pop();
    if (next !== undefined) picked.push(next);
    bi++;
  }

  const questions: PublicQuestion[] = [];
  const answerKey: number[] = [];

  for (const q of picked) {
    // Shuffle the four options, remembering where the correct one landed.
    const shuffledOptions = shuffle(
      q.options.map((text, idx) => ({ text, idx })),
      rng,
    );
    const correctPos = shuffledOptions.findIndex((o) => o.idx === q.answer);

    questions.push({ topic: q.topic, q: q.q, options: shuffledOptions.map((o) => o.text) });
    answerKey.push(correctPos);
  }

  return { questions, answerKey };
}

export interface ScoreResult {
  score: number;
  total: number;
  passed: boolean;
}

/**
 * Scores a submission against the server-held answer key.
 *
 * Lenient on length exactly as the legacy was: a timed-out final question may
 * arrive short, so answers are padded to the served total and any missing or
 * out-of-range answer scores as wrong. Passing needs `passRatio` of the total,
 * and a zero-length key never passes.
 */
export function scoreAttempt(
  answerKey: readonly number[],
  answers: readonly number[],
  passRatio: number = EXAM_POLICY.passRatio,
): ScoreResult {
  const total = answerKey.length;

  let score = 0;
  for (let i = 0; i < total; i++) {
    // Missing answers (undefined) and the "not answered" sentinel both miss.
    if (answers[i] === answerKey[i]) score += 1;
  }

  const passed = total > 0 && score / total >= passRatio;
  return { score, total, passed };
}

/**
 * A small seedable RNG (mulberry32) for tests and any reproducible draw.
 *
 * `Math.random` is unavailable in some of this repo's runtimes and untestable
 * everywhere, so the engine takes an `Rng`. Production passes `Math.random`;
 * tests pass this so a draw is repeatable and its exact output can be asserted.
 */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
