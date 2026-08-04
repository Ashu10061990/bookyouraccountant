import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertIndexes } from "../config/db.js";
import type { Notifier, NotifyInput } from "../integrations/notifications.js";
import { TOKENS, UIDS, as, buildTestApp } from "../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";
import { seededRng } from "../helpers/exam-engine.helper.js";
import { ExamSessionModel } from "../models/exam.model.js";
import { NotificationModel } from "../models/notification.model.js";
import { UserModel } from "../models/user.model.js";

/**
 * Proves N3's wiring — spec `docs/specs/2026-07-25-notifications-slice.md`.
 *
 * Two "became verified" moments live in `accountants.service.ts`: the
 * born-verified branch of `createProfile`, and the admin `verifyAccountant`
 * path. Both should fire `accountant_verified`, fire-and-forget; an
 * unverified create should fire nothing.
 *
 * The primary proof is a fake `Notifier` injected via `buildTestApp`
 * (`app`, below). `fakeNotifier`'s `notify` records synchronously — the
 * `calls.push` happens before the service's `void notifier.notify(...)` call
 * site finishes executing — so asserting on `notified` immediately after
 * `app.inject` resolves is never racy.
 *
 * `defaultApp` uses the real `Notifier` (no SMTP/WA/MSG91 secrets in
 * `testEnv()`, so every channel is `skipped`) to also exercise the real
 * `logDelivery` write against Mongo end-to-end — a path N1/N2 left to this
 * suite. That notifier's own async work genuinely outlives the
 * fire-and-forget call, so that one assertion polls with `vi.waitFor`
 * instead of racing it.
 */

/** Records every `notify` call it receives, verbatim, in call order. */
function fakeNotifier(): { notifier: Notifier; calls: NotifyInput[] } {
  const calls: NotifyInput[] = [];
  return {
    calls,
    notifier: {
      notify(input: NotifyInput): Promise<void> {
        calls.push(input);
        return Promise.resolve();
      },
    },
  };
}

const PROFILE = {
  name: "Asha Rao",
  email: "asha@example.com",
  phone: "+919876543210",
  city: "Kochi",
  state: "Kerala",
  qualifications: ["ca"],
  experienceYears: 8,
  specialties: ["gst"],
  languages: ["english"],
  accountingSoftware: [],
  complianceSoftware: [],
};

/** White-box: reads the stored key so the test can submit a genuine pass —
 * the same trick exams.test.ts / onboarding.e2e.test.ts use; no client can. */
async function correctAnswersFor(sessionId: string): Promise<number[]> {
  const session = await ExamSessionModel.findById(sessionId).lean();
  return [...session!.answerKey];
}

/** Starts and passes a genuine exam for the accountant token, against whichever app instance is given. */
async function passExam(target: FastifyInstance): Promise<void> {
  const start = await target.inject({
    method: "POST",
    url: "/v1/exam/start",
    headers: as(TOKENS.accountant),
  });
  expect(start.statusCode).toBe(200);
  const { sessionId } = start.json<{ exam: { sessionId: string } }>().exam;

  const answers = await correctAnswersFor(sessionId);
  const submit = await target.inject({
    method: "POST",
    url: "/v1/exam/submit",
    headers: as(TOKENS.accountant),
    payload: { sessionId, answers },
  });
  expect(submit.json()).toMatchObject({ result: { passed: true } });
}

const clock = new Date("2026-07-24T00:00:00Z");

let app: FastifyInstance;
let defaultApp: FastifyInstance;
let notified: NotifyInput[];

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();

  const fake = fakeNotifier();
  notified = fake.calls;
  app = await buildTestApp(
    {},
    undefined,
    { examRng: seededRng(7), now: () => clock },
    undefined,
    fake.notifier,
  );

  // A second instance over the SAME database, deliberately left at its real,
  // default notifier — the one case that exercises `logDelivery` against real
  // Mongo end-to-end.
  defaultApp = await buildTestApp({}, undefined, { examRng: seededRng(23), now: () => clock });
}, 60_000);

afterAll(async () => {
  await app.close();
  await defaultApp.close();
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
  notified.length = 0;
  await UserModel.create([
    { authUid: UIDS.accountant, role: "accountant", blocked: false },
    { authUid: UIDS.admin, role: "admin", blocked: false },
  ]);
});

describe("accountant_verified — fake Notifier (deterministic, primary proof)", () => {
  it("a born-verified registration fires exactly one accountant_verified notify", async () => {
    await passExam(app);

    const register = await app.inject({
      method: "POST",
      url: "/v1/accountants",
      headers: as(TOKENS.accountant),
      payload: PROFILE,
    });
    expect(register.statusCode).toBe(201);
    expect(register.json()).toMatchObject({ accountant: { verified: true } });

    expect(notified).toHaveLength(1);
    expect(notified).toContainEqual({
      event: "accountant_verified",
      to: { email: "asha@example.com", phone: "+919876543210" },
      data: { name: "Asha Rao" },
    });
  });

  it("an unverified create (no exam pass) fires no notification", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/v1/accountants",
      headers: as(TOKENS.accountant),
      payload: PROFILE,
    });

    expect(register.statusCode).toBe(201);
    expect(register.json()).toMatchObject({ accountant: { verified: false } });
    expect(notified).toHaveLength(0);
  });

  it("the admin verify route fires one accountant_verified notify", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/v1/accountants",
      headers: as(TOKENS.accountant),
      payload: PROFILE,
    });
    expect(created.json()).toMatchObject({ accountant: { verified: false } });

    const res = await app.inject({
      method: "POST",
      url: `/v1/accountants/${UIDS.accountant}/verify`,
      headers: as(TOKENS.admin),
      payload: { examScore: 82, examTotal: 100 },
    });

    expect(res.statusCode).toBe(200);
    expect(notified).toHaveLength(1);
    expect(notified).toContainEqual({
      event: "accountant_verified",
      to: { email: "asha@example.com", phone: "+919876543210" },
      data: { name: "Asha Rao" },
    });
  });
});

describe("accountant_verified — real delivery log (default notifier, no channels configured)", () => {
  it("writes a skipped row per channel for a born-verified registration", async () => {
    await passExam(defaultApp);

    const register = await defaultApp.inject({
      method: "POST",
      url: "/v1/accountants",
      headers: as(TOKENS.accountant),
      payload: PROFILE,
    });
    expect(register.json()).toMatchObject({ accountant: { verified: true } });

    // The route already responded by the time `createProfile` returns —
    // `notifier.notify` runs fire-and-forget (`void`), so the real
    // notifier's delivery-log write can still be in flight here. Poll
    // rather than race it.
    await vi.waitFor(async () => {
      const rows = await NotificationModel.find({ event: "accountant_verified" }).lean();
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.status === "skipped")).toBe(true);
      expect(rows.map((row) => row.channel).sort()).toEqual(["email", "sms", "whatsapp"]);
    });
  });
});
