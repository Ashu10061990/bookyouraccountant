import { EXAM_POLICY } from "@bya/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../../platform/db.js";
import { seededRng } from "./exam-engine.js";
import { ExamAttemptModel, ExamSessionModel } from "./exams.schema.js";
import { AccountantModel } from "../accountants/accountants.schema.js";
import { UserModel } from "../users/users.schema.js";
import { TOKENS, UIDS, as, buildTestApp } from "../../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../../test/mongo.js";

let app: FastifyInstance;
// A fixed clock so the throttle window is deterministic.
let clock = new Date("2026-07-24T00:00:00Z");

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();
  app = await buildTestApp({}, undefined, { examRng: seededRng(42), now: () => clock });
}, 60_000);

afterAll(async () => {
  await app.close();
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
  clock = new Date("2026-07-24T00:00:00Z");
  await UserModel.create([
    { firebaseUid: UIDS.accountant, role: "accountant", blocked: false },
    { firebaseUid: UIDS.other, role: "accountant", blocked: false },
    { firebaseUid: UIDS.business, role: "business", blocked: false },
  ]);
});

async function startExam(
  token = TOKENS.accountant,
): Promise<{ sessionId: string; questions: unknown[] }> {
  const res = await app.inject({ method: "POST", url: "/v1/exam/start", headers: as(token) });
  expect(res.statusCode).toBe(200);
  return res.json<{ exam: { sessionId: string; questions: unknown[] } }>().exam;
}

/**
 * Answers a served paper correctly by reading the stored session key — this is
 * the TEST cheating so it can assert a legitimate pass, never a path the client
 * has. A real client cannot do this, which the leak tests below prove.
 */
async function correctAnswersFor(sessionId: string): Promise<number[]> {
  const session = await ExamSessionModel.findById(sessionId).lean();
  return [...session!.answerKey];
}

describe("POST /v1/exam/start", () => {
  it("serves a paper of the configured size to an accountant", async () => {
    const exam = await startExam();
    expect(exam.questions).toHaveLength(EXAM_POLICY.questionsPerAttempt);
    expect(exam.sessionId).toBeTruthy();
  });

  it("denies a business", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/exam/start",
      headers: as(TOKENS.business),
    });
    expect(res.statusCode).toBe(403);
  });

  it("denies an unauthenticated caller", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/exam/start" });
    expect(res.statusCode).toBe(401);
  });
});

describe("the answer key never reaches the client — the whole security model", () => {
  it("serves questions with no answer, correct index, or key of any kind", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/exam/start",
      headers: as(TOKENS.accountant),
    });
    const payload = res.payload;

    // The served paper must not carry the key in any form.
    const exam = res.json<{ exam: { questions: { options: string[] }[] } }>().exam;
    for (const q of exam.questions) {
      expect(q).not.toHaveProperty("answer");
      expect(q).not.toHaveProperty("answerKey");
      expect(q).not.toHaveProperty("correctPos");
    }
    expect(payload).not.toContain("answerKey");
    expect(payload).not.toContain("correctPos");
  });

  it("keeps the key server-side: it exists in the session but is never returned", async () => {
    const exam = await startExam();
    const session = await ExamSessionModel.findById(exam.sessionId).lean();

    // The server has the key…
    expect(session!.answerKey).toHaveLength(EXAM_POLICY.questionsPerAttempt);
    // …and there is no route that returns a session. The only exam routes are
    // start and submit; a GET on a session id is not a route at all.
    const probe = await app.inject({
      method: "GET",
      url: `/v1/exam/session/${exam.sessionId}`,
      headers: as(TOKENS.accountant),
    });
    expect(probe.statusCode).toBe(404);
  });
});

describe("POST /v1/exam/submit — scoring is server-side and untrusted", () => {
  it("passes a genuinely correct submission and records the attempt", async () => {
    const exam = await startExam();
    const answers = await correctAnswersFor(exam.sessionId);

    const res = await app.inject({
      method: "POST",
      url: "/v1/exam/submit",
      headers: as(TOKENS.accountant),
      payload: { sessionId: exam.sessionId, answers },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ result: { passed: true, total: 20 } });

    const attempt = await ExamAttemptModel.findOne({ ownerId: UIDS.accountant });
    expect(attempt?.passed).toBe(true);
  });

  // The attack a token-based API must defend that Firestore's SDK did for free:
  // the client cannot claim a score. It sends chosen positions, and the server
  // scores them against the key the client never saw.
  it("ignores wrong answers however the client dresses them up", async () => {
    const exam = await startExam();

    const res = await app.inject({
      method: "POST",
      url: "/v1/exam/submit",
      headers: as(TOKENS.accountant),
      payload: {
        sessionId: exam.sessionId,
        answers: Array.from({ length: 20 }, () => 0),
        // A forged score/passed must have no effect — the schema strips them and
        // the server computes its own.
        score: 20,
        passed: true,
      },
    });

    const result = res.json<{ result: { score: number; passed: boolean } }>().result;
    // Answering all-zero cannot reliably score 20/20 against a shuffled key.
    expect(result.score).toBeLessThan(20);
    // And whatever it scored, `passed` is the server's computation, not the
    // forged `true`.
    expect(result.passed).toBe(result.score / 20 >= EXAM_POLICY.passRatio);
  });

  it("rejects a submission for someone else's session", async () => {
    const exam = await startExam(TOKENS.accountant);

    const res = await app.inject({
      method: "POST",
      url: "/v1/exam/submit",
      headers: as(TOKENS.other),
      payload: { sessionId: exam.sessionId, answers: Array(20).fill(0) },
    });

    expect(res.statusCode).toBe(403);
    // The victim's session is untouched.
    expect((await ExamSessionModel.findById(exam.sessionId).lean())?.used).toBe(false);
  });

  it("404s an unknown session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/exam/submit",
      headers: as(TOKENS.accountant),
      payload: { sessionId: "64b2f00000000000000000aa", answers: [] },
    });
    expect(res.statusCode).toBe(404);
  });

  it("is idempotent: resubmitting returns the stored result, not a re-score", async () => {
    const exam = await startExam();
    const answers = await correctAnswersFor(exam.sessionId);
    const first = await app.inject({
      method: "POST",
      url: "/v1/exam/submit",
      headers: as(TOKENS.accountant),
      payload: { sessionId: exam.sessionId, answers },
    });

    const second = await app.inject({
      method: "POST",
      url: "/v1/exam/submit",
      headers: as(TOKENS.accountant),
      // Different answers the second time must not matter.
      payload: { sessionId: exam.sessionId, answers: Array(20).fill(0) },
    });

    expect(second.json()).toMatchObject({ result: { alreadySubmitted: true } });
    expect(second.json<{ result: { score: number } }>().result.score).toBe(
      first.json<{ result: { score: number } }>().result.score,
    );
    // Exactly one attempt recorded.
    expect(await ExamAttemptModel.countDocuments({ ownerId: UIDS.accountant })).toBe(1);
  });
});

describe("attempt throttle — 2 fails per 180 days", () => {
  async function failOnce(): Promise<void> {
    const exam = await startExam();
    await app.inject({
      method: "POST",
      url: "/v1/exam/submit",
      headers: as(TOKENS.accountant),
      payload: { sessionId: exam.sessionId, answers: Array(20).fill(-1) }, // all unanswered → fail
    });
  }

  it("blocks a third start after two recent fails", async () => {
    await failOnce();
    await failOnce();

    const third = await app.inject({
      method: "POST",
      url: "/v1/exam/start",
      headers: as(TOKENS.accountant),
    });
    expect(third.statusCode).toBe(403);
    expect(third.payload).toMatch(/next attempt opens/i);
  });

  it("reopens once the older fail leaves the window", async () => {
    await failOnce();
    await failOnce();

    // Advance the clock past the 180-day window.
    clock = new Date(clock.getTime() + (EXAM_POLICY.windowDays + 1) * 24 * 3600 * 1000);

    const res = await app.inject({
      method: "POST",
      url: "/v1/exam/start",
      headers: as(TOKENS.accountant),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("passing the exam verifies the accountant", () => {
  it("marks an existing profile verified, audited, on a pass", async () => {
    await AccountantModel.create({
      firebaseUid: UIDS.accountant,
      name: "Asha",
      city: "Kochi",
      state: "Kerala",
      qualifications: ["ca"],
      experienceYears: 10,
      specialties: ["gst"],
      languages: ["english"],
      accountingSoftware: [],
      complianceSoftware: [],
      verified: false,
      examScore: 0,
      examTotal: 0,
      rating: 0,
      reviewsCount: 0,
    });

    const exam = await startExam();
    const answers = await correctAnswersFor(exam.sessionId);
    await app.inject({
      method: "POST",
      url: "/v1/exam/submit",
      headers: as(TOKENS.accountant),
      payload: { sessionId: exam.sessionId, answers },
    });

    const acc = await AccountantModel.findOne({ firebaseUid: UIDS.accountant });
    expect(acc?.verified).toBe(true);
    expect(acc?.verifiedBy).toBe("exam");
    expect(acc?.examScore).toBe(20);
  });

  it("does not verify anyone on a failing attempt", async () => {
    await AccountantModel.create({
      firebaseUid: UIDS.accountant,
      name: "Asha",
      city: "Kochi",
      state: "Kerala",
      qualifications: ["ca"],
      experienceYears: 10,
      specialties: ["gst"],
      languages: ["english"],
      accountingSoftware: [],
      complianceSoftware: [],
      verified: false,
      examScore: 0,
      examTotal: 0,
      rating: 0,
      reviewsCount: 0,
    });

    const exam = await startExam();
    await app.inject({
      method: "POST",
      url: "/v1/exam/submit",
      headers: as(TOKENS.accountant),
      payload: { sessionId: exam.sessionId, answers: Array(20).fill(-1) },
    });

    expect((await AccountantModel.findOne({ firebaseUid: UIDS.accountant }))?.verified).toBe(false);
  });
});
