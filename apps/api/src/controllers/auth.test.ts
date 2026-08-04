import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../config/db.js";
import { jwtVerifier } from "../integrations/token-verifier.js";
import { NotificationModel } from "../models/notification.model.js";
import { UserModel } from "../models/user.model.js";
import { testEnv } from "../test/env.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";

/**
 * The `/v1/auth/*` surface end-to-end: real routes, real controllers, real
 * service, real Mongo — and, unlike every other controller suite, the REAL
 * token verifier. The whole point of these endpoints is minting tokens the
 * rest of the API accepts, so faking verification here would test nothing.
 *
 * `AUTH_DEV_ECHO_OTP=true` (legal outside production; env.test.ts proves the
 * production refusal) is how the tests read the code "sent" — the same way
 * local development runs with no MSG91 credentials.
 */

const PHONE = "+919876543210";

let app: FastifyInstance;
let clock: Date;

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();

  const env = testEnv({ AUTH_DEV_ECHO_OTP: true });
  app = await (
    await import("../test/app.js")
  ).buildTestApp(
    // The real verifier, over the same secret the service signs with — and
    // the same fake clock, so expiry is judged in test time, not wall time.
    { verifier: jwtVerifier(env.JWT_SECRET, () => clock) },
    undefined,
    { now: () => clock },
    undefined,
    undefined,
    env,
  );
}, 60_000);

afterAll(async () => {
  await app.close();
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
  clock = new Date("2026-08-04T10:00:00.000Z");
});

function advance(seconds: number): void {
  clock = new Date(clock.getTime() + seconds * 1000);
}

interface OtpRequestBody {
  expiresInSec: number;
  resendAfterSec: number;
  devOtp?: string;
}

interface SessionBody {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  authUid: string;
}

async function requestOtp(phone = PHONE): Promise<{ statusCode: number; devOtp?: string }> {
  const res = await app.inject({ method: "POST", url: "/v1/auth/otp/request", payload: { phone } });
  if (res.statusCode !== 200) return { statusCode: res.statusCode };
  const body = res.json<OtpRequestBody>();
  return {
    statusCode: res.statusCode,
    ...(body.devOtp === undefined ? {} : { devOtp: body.devOtp }),
  };
}

async function signIn(): Promise<SessionBody> {
  const { devOtp } = await requestOtp();
  advance(31); // clear the resend cooldown for whatever the test does next
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/otp/verify",
    payload: { phone: PHONE, otp: devOtp },
  });
  expect(res.statusCode).toBe(200);
  return res.json<SessionBody>();
}

describe("POST /v1/auth/otp/request", () => {
  it("returns 200 with expiry, cooldown and (dev only) the echoed code", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: { phone: PHONE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ expiresInSec: 300, resendAfterSec: 30 });
    expect(res.json<OtpRequestBody>().devOtp).toMatch(/^\d{6}$/);
  });

  it("carries its own per-IP rate-limit budget, tighter than the global one", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: { phone: "+919876500001" },
    });

    // The route-level @fastify/rate-limit config (30/15min), not the global
    // 100k test ceiling — proof the override is attached to this route.
    expect(res.headers["x-ratelimit-limit"]).toBe("30");
  });

  it("logs a skipped SMS delivery row when no channel is configured", async () => {
    await requestOtp();

    const row = await NotificationModel.findOne({ event: "auth_otp", channel: "sms" }).lean();
    expect(row?.status).toBe("skipped");
  });

  it("rejects a malformed phone", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: { phone: "9876543210" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("429s a resend inside the cooldown, then allows it after", async () => {
    await requestOtp();

    const tooSoon = await app.inject({
      method: "POST",
      url: "/v1/auth/otp/request",
      payload: { phone: PHONE },
    });
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });

    advance(31);
    expect((await requestOtp()).statusCode).toBe(200);
  });
});

describe("POST /v1/auth/otp/verify", () => {
  it("mints a session whose access token the rest of the API accepts", async () => {
    const session = await signIn();

    expect(session.authUid).toMatch(/^[0-9a-f]{24}$/);
    expect(session.refreshToken.length).toBeGreaterThanOrEqual(43);

    // The minted token drives a REAL guarded route: creating the user row.
    const created = await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { role: "business", phone: PHONE },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ user: { authUid: session.authUid } });
    expect(await UserModel.countDocuments({ authUid: session.authUid })).toBe(1);
  });

  it("denies a wrong code without saying why the token store refused it", async () => {
    const { devOtp } = await requestOtp();
    const wrong = devOtp === "000000" ? "000001" : "000000";

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { phone: PHONE, otp: wrong },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "OTP_INVALID" } });
  });

  it("rejects a malformed otp shape before touching the service", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/otp/verify",
      payload: { phone: PHONE, otp: "12345" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /v1/auth/refresh", () => {
  it("rotates the pair, and a replay of the old token kills the family", async () => {
    const session = await signIn();

    const rotated = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: session.refreshToken },
    });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json<SessionBody>().authUid).toBe(session.authUid);
    expect(rotated.json<SessionBody>().refreshToken).not.toBe(session.refreshToken);

    // Replay = theft signal.
    const replay = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: session.refreshToken },
    });
    expect(replay.statusCode).toBe(401);

    // The successor died with the family.
    const successor = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: rotated.json<SessionBody>().refreshToken },
    });
    expect(successor.statusCode).toBe(401);
  });

  it("401s an unknown token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: "A".repeat(43) },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("POST /v1/auth/logout", () => {
  it("revokes the family and returns 204", async () => {
    const session = await signIn();

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { refreshToken: session.refreshToken },
    });
    expect(res.statusCode).toBe(204);

    const refresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: session.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
  });

  // The security guard's denial test: logout is an authenticated route.
  it("401s without a bearer token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      payload: { refreshToken: "A".repeat(43) },
    });

    expect(res.statusCode).toBe(401);
  });

  it("403s an authenticated caller presenting someone else's token", async () => {
    const victim = await signIn();
    advance(31);

    const attacker = await (async () => {
      const { devOtp } = await requestOtp("+919876500002");
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/otp/verify",
        payload: { phone: "+919876500002", otp: devOtp },
      });
      return res.json<SessionBody>();
    })();

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${attacker.accessToken}` },
      payload: { refreshToken: victim.refreshToken },
    });
    expect(res.statusCode).toBe(403);

    // The victim's session survives the attempt.
    const refresh = await app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken: victim.refreshToken },
    });
    expect(refresh.statusCode).toBe(200);
  });
});
