/**
 * Generates apps/api/src/data/exam-bank.ts from the FROZEN legacy
 * examBank.js. The `answer` index of every question is the correct option and
 * must be exact — a transcription slip would silently pass or fail candidates
 * on a wrong key — so it is generated from the source, never retyped.
 *
 * The bank lives in apps/api ONLY. It contains correct answers; it must never
 * reach packages/shared, which both frontends import.
 *
 *   node apps/api/scripts/gen-exam-bank.mjs
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  EXAM_POOL,
} = require("/Users/shubhamverma/Documents/Personal/GARP-Associates/BYA& Keiri/bya-new/functions/examBank.js");

const OUT =
  "/Users/shubhamverma/Documents/Personal/GARP-Associates/bookyouraccountant/apps/api/src/data/exam-bank.ts";

const body = EXAM_POOL.map((q) => {
  const opts = q.options.map((o) => JSON.stringify(o)).join(", ");
  return `  { id: ${JSON.stringify(q.id)}, topic: ${JSON.stringify(q.topic)}, q: ${JSON.stringify(q.q)}, options: [${opts}], answer: ${q.answer} },`;
}).join("\n");

const file = `// GENERATED from the frozen legacy functions/examBank.js — do not hand-edit.
// Regenerate: node apps/api/scripts/gen-exam-bank.mjs
//
// SERVER-ONLY. Every entry carries the correct \`answer\` index. This file must
// never be imported from packages/shared or any frontend bundle — the answer
// key would ship to the client and the exam would be trivially cheatable.
// Feature inventory §19: the 293-question bank across 11 topics.

/** One exam question with its correct option index (0-based). */
export interface ExamQuestion {
  id: string;
  topic: string;
  q: string;
  options: [string, string, string, string];
  answer: number;
}

export const EXAM_POOL: readonly ExamQuestion[] = [
${body}
];
`;

writeFileSync(OUT, file);
console.log(
  `exam bank: ${EXAM_POOL.length} questions across ${new Set(EXAM_POOL.map((q) => q.topic)).size} topics`,
);
