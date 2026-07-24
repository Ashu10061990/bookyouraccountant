import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../platform/db.js";
import { seededRng } from "./exams/exam-engine.js";
import { ExamSessionModel } from "./exams/exams.schema.js";
import { TOKENS, UIDS, as, buildTestApp } from "../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";

let app: FastifyInstance;
const clock = new Date("2026-07-24T00:00:00Z");

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();
  // No pre-seeded users: this test bootstraps its own accountant, exactly as
  // the SPA will after OTP.
  app = await buildTestApp({}, undefined, { examRng: seededRng(7), now: () => clock });
}, 60_000);

afterAll(async () => {
  await app.close();
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
});

/** Reads the stored key so the test can submit a genuine pass — the same
 * white-box trick the exam suite uses; no client can do this. */
async function correctAnswersFor(sessionId: string): Promise<number[]> {
  const session = await ExamSessionModel.findById(sessionId).lean();
  return [...session!.answerKey];
}

describe("accountant onboarding — the whole journey the SPA drives", () => {
  it("bootstrap → exam pass → register → born verified", async () => {
    // 1. Bootstrap the user record (role gate for the exam). The SPA does this
    //    right after OTP; a 409 on a repeat is treated as success there.
    const bootstrap = await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: as(TOKENS.accountant),
      payload: { role: "accountant", phone: "+919876543210" },
    });
    expect(bootstrap.statusCode).toBe(201);

    // 2. Start the exam (requires the accountant role from step 1).
    const start = await app.inject({
      method: "POST",
      url: "/v1/exam/start",
      headers: as(TOKENS.accountant),
    });
    expect(start.statusCode).toBe(200);
    const { sessionId } = start.json<{ exam: { sessionId: string } }>().exam;

    // 3. Submit a genuinely correct paper → pass. The server records the pass.
    const answers = await correctAnswersFor(sessionId);
    const submit = await app.inject({
      method: "POST",
      url: "/v1/exam/submit",
      headers: as(TOKENS.accountant),
      payload: { sessionId, answers },
    });
    expect(submit.json()).toMatchObject({ result: { passed: true, total: 20 } });

    // 4. Register the profile. No `verified` in the body — the server reads the
    //    recorded pass and mints it verified.
    const register = await app.inject({
      method: "POST",
      url: "/v1/accountants",
      headers: as(TOKENS.accountant),
      payload: {
        name: "Asha Rao",
        city: "Kochi",
        state: "Kerala",
        qualifications: ["ca"],
        experienceYears: 8,
        specialties: ["gst"],
        languages: ["english"],
        accountingSoftware: [],
        complianceSoftware: [],
      },
    });
    expect(register.statusCode).toBe(201);
    expect(register.json()).toMatchObject({ accountant: { verified: true } });

    // 5. The terminal read the SPA lands on: owner sees the private view.
    const me = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}`,
      headers: as(TOKENS.accountant),
    });
    const view = me.json<{ accountant: { verified: boolean; examScore: number } }>().accountant;
    expect(view.verified).toBe(true);
    expect(view.examScore).toBe(20);
  });

  it("refuses to start the exam before the user is bootstrapped (401)", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/v1/exam/start",
      headers: as(TOKENS.accountant),
    });
    expect(start.statusCode).toBe(401);
  });

  it("rejects a client-forged `verified: true` on registration", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: as(TOKENS.accountant),
      payload: { role: "accountant" },
    });
    const register = await app.inject({
      method: "POST",
      url: "/v1/accountants",
      headers: as(TOKENS.accountant),
      payload: {
        name: "Forger",
        city: "X",
        state: "Y",
        qualifications: ["ca"],
        experienceYears: 1,
        specialties: ["gst"],
        languages: ["english"],
        accountingSoftware: [],
        complianceSoftware: [],
        verified: true,
      },
    });
    expect(register.statusCode).toBe(403);
  });
});
