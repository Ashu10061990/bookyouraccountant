import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../config/db.js";
import { jwtVerifier } from "../integrations/token-verifier.js";
import type { NotifyInput } from "../integrations/notifications.js";
import { OtpModel } from "../models/otp.model.js";
import { RefreshTokenModel } from "../models/refresh-token.model.js";
import { UserModel } from "../models/user.model.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";
import {
  logout,
  refreshSession,
  requestOtp,
  verifyOtp,
  type AuthServiceDeps,
} from "./auth.service.js";

/**
 * The OTP + refresh-token lifecycle, exercised directly against the service
 * with the REAL jwt sign/verify path — no fakes anywhere in the token chain.
 *
 * Time is a mutable fake clock (`deps.now`), so expiry, cooldown and the
 * hourly window are tested by moving time, not by sleeping.
 */

const SECRET = "test-jwt-secret-0123456789abcdef0123456789abcdef";
const PHONE = "+919876543210";
const OTHER_PHONE = "+919876500000";

let clock: Date;
let notified: NotifyInput[];

function makeDeps(config: Partial<AuthServiceDeps["config"]> = {}): AuthServiceDeps {
  return {
    notifier: {
      notify(input) {
        notified.push(input);
        return Promise.resolve();
      },
    },
    config: {
      jwtSecret: SECRET,
      otpTtlSec: 300,
      otpMaxAttempts: 5,
      otpResendCooldownSec: 30,
      devEchoOtp: false,
      ...config,
    },
    now: () => clock,
  };
}

function advance(seconds: number): void {
  clock = new Date(clock.getTime() + seconds * 1000);
}

/** The OTP the service just "sent", read from the recorded notifier call. */
function sentOtp(): string {
  const last = notified.at(-1);
  if (last === undefined) throw new Error("no notification recorded");
  return String(last.data["otp"]);
}

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();
}, 60_000);

afterAll(async () => {
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
  clock = new Date("2026-08-04T10:00:00.000Z");
  notified = [];
});

describe("requestOtp", () => {
  it("sends via the notifier's auth_otp event and reports expiry/cooldown", async () => {
    const result = await requestOtp(makeDeps(), PHONE);

    expect(result).toEqual({ expiresInSec: 300, resendAfterSec: 30 });
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({ event: "auth_otp", to: { phone: PHONE } });
    expect(sentOtp()).toMatch(/^\d{6}$/);
  });

  it("stores only a salted hash — never the code itself", async () => {
    await requestOtp(makeDeps(), PHONE);
    const otp = sentOtp();

    const stored = await OtpModel.findOne({ phone: PHONE }).lean();
    expect(stored).not.toBeNull();
    expect(stored?.otpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(stored)).not.toContain(otp);
    expect(stored?.otpHash).toBe(
      createHash("sha256").update(`${stored?.salt}:${otp}`).digest("hex"),
    );
  });

  it("returns the IDENTICAL response for a known and an unknown phone", async () => {
    await UserModel.create({
      authUid: "e".repeat(24),
      role: "business",
      blocked: false,
      phone: PHONE,
    });

    const forExisting = await requestOtp(makeDeps(), PHONE);
    const forUnknown = await requestOtp(makeDeps(), OTHER_PHONE);

    expect(forExisting).toEqual(forUnknown);
  });

  it("enforces the 30s resend cooldown per phone", async () => {
    await requestOtp(makeDeps(), PHONE);

    await expect(requestOtp(makeDeps(), PHONE)).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
    });

    // A different phone is not caught by this phone's cooldown.
    await expect(requestOtp(makeDeps(), OTHER_PHONE)).resolves.toBeDefined();

    advance(31);
    await expect(requestOtp(makeDeps(), PHONE)).resolves.toBeDefined();
  });

  it("caps sends at 5 per phone per rolling hour, from the collection", async () => {
    for (let i = 0; i < 5; i += 1) {
      await requestOtp(makeDeps(), PHONE);
      advance(60);
    }

    // Cooldown has long passed; the hourly cap is what refuses this one.
    await expect(requestOtp(makeDeps(), PHONE)).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
    });

    // Window rolls: 61 minutes after the first send, one slot frees up.
    advance(60 * 61 - 5 * 60);
    await expect(requestOtp(makeDeps(), PHONE)).resolves.toBeDefined();
  });

  it("echoes the code only when devEchoOtp is on", async () => {
    const withoutEcho = await requestOtp(makeDeps(), PHONE);
    expect(withoutEcho).not.toHaveProperty("devOtp");

    advance(31);
    const withEcho = await requestOtp(makeDeps({ devEchoOtp: true }), PHONE);
    expect(withEcho.devOtp).toBe(sentOtp());
  });
});

describe("verifyOtp", () => {
  it("verifies the sent code and issues a real, verifiable session", async () => {
    await requestOtp(makeDeps(), PHONE);
    const session = await verifyOtp(makeDeps(), PHONE, sentOtp());

    expect(session.authUid).toMatch(/^[0-9a-f]{24}$/);
    expect(session.expiresInSec).toBe(15 * 60);

    // The REAL jwt path: the access token verifies against the same secret.
    const verified = await jwtVerifier(SECRET, () => clock).verify(session.accessToken);
    expect(verified.uid).toBe(session.authUid);
    expect(verified.phone).toBe(PHONE);

    // The refresh token is stored hashed, never raw.
    const stored = await RefreshTokenModel.findOne({ authUid: session.authUid }).lean();
    expect(stored?.tokenHash).toBe(createHash("sha256").update(session.refreshToken).digest("hex"));
    expect(JSON.stringify(stored)).not.toContain(session.refreshToken);
  });

  it("reuses the existing identity when the phone already has a user row", async () => {
    await UserModel.create({
      authUid: "f".repeat(24),
      role: "business",
      blocked: false,
      phone: PHONE,
    });

    await requestOtp(makeDeps(), PHONE);
    const session = await verifyOtp(makeDeps(), PHONE, sentOtp());

    expect(session.authUid).toBe("f".repeat(24));
    expect((await UserModel.findOne({ phone: PHONE }))?.lastLoginAt).toBeDefined();
  });

  it("rejects a wrong code, and kills the record after 5 wrong attempts", async () => {
    await requestOtp(makeDeps(), PHONE);
    const otp = sentOtp();
    const wrong = otp === "000000" ? "000001" : "000000";

    for (let i = 0; i < 5; i += 1) {
      await expect(verifyOtp(makeDeps(), PHONE, wrong)).rejects.toMatchObject({
        status: 401,
        code: "OTP_INVALID",
      });
    }

    // Attempt 6 is refused BEFORE comparison — even the correct code is dead.
    await expect(verifyOtp(makeDeps(), PHONE, otp)).rejects.toMatchObject({
      status: 429,
      code: "OTP_ATTEMPTS_EXHAUSTED",
    });
  });

  it("denies an expired code", async () => {
    await requestOtp(makeDeps(), PHONE);
    const otp = sentOtp();

    advance(301);
    await expect(verifyOtp(makeDeps(), PHONE, otp)).rejects.toMatchObject({
      status: 410,
      code: "OTP_EXPIRED",
    });
  });

  it("is single use: a consumed code cannot sign in twice", async () => {
    await requestOtp(makeDeps(), PHONE);
    const otp = sentOtp();

    await verifyOtp(makeDeps(), PHONE, otp);
    await expect(verifyOtp(makeDeps(), PHONE, otp)).rejects.toMatchObject({
      status: 401,
      code: "OTP_INVALID",
    });
  });

  it("denies when no code was ever requested", async () => {
    await expect(verifyOtp(makeDeps(), PHONE, "123456")).rejects.toMatchObject({
      status: 401,
      code: "OTP_INVALID",
    });
  });

  it("a new request supersedes the previous still-open code", async () => {
    await requestOtp(makeDeps(), PHONE);
    const first = sentOtp();
    advance(31);
    await requestOtp(makeDeps(), PHONE);

    await expect(verifyOtp(makeDeps(), PHONE, first)).rejects.toMatchObject({
      code: "OTP_INVALID",
    });
  });
});

async function signIn(): Promise<{ authUid: string; refreshToken: string }> {
  await requestOtp(makeDeps(), PHONE);
  const session = await verifyOtp(makeDeps(), PHONE, sentOtp());
  return { authUid: session.authUid, refreshToken: session.refreshToken };
}

describe("refreshSession", () => {
  it("rotates: new pair, old marked rotated, same family", async () => {
    const { authUid, refreshToken } = await signIn();

    const next = await refreshSession(makeDeps(), refreshToken);
    expect(next.authUid).toBe(authUid);
    expect(next.refreshToken).not.toBe(refreshToken);

    const rows = await RefreshTokenModel.find({ authUid }).lean();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.familyId)).size).toBe(1);
    const oldRow = rows.find(
      (row) => row.tokenHash === createHash("sha256").update(refreshToken).digest("hex"),
    );
    expect(oldRow?.rotatedAt).toBeDefined();

    // The rotated access token still verifies on the real path.
    const verified = await jwtVerifier(SECRET, () => clock).verify(next.accessToken);
    expect(verified.uid).toBe(authUid);
  });

  it("treats reuse of a rotated token as theft: whole family revoked, 401", async () => {
    const { authUid, refreshToken } = await signIn();
    const next = await refreshSession(makeDeps(), refreshToken);

    // Replay the OLD token.
    await expect(refreshSession(makeDeps(), refreshToken)).rejects.toMatchObject({
      status: 401,
    });

    // The theft signal killed the successor too.
    await expect(refreshSession(makeDeps(), next.refreshToken)).rejects.toMatchObject({
      status: 401,
    });
    const rows = await RefreshTokenModel.find({ authUid }).lean();
    expect(rows.every((row) => row.revokedAt !== undefined)).toBe(true);
  });

  it("rejects an unknown token with an opaque 401", async () => {
    await expect(refreshSession(makeDeps(), "not-a-real-token")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });

  it("rejects an expired token", async () => {
    const { refreshToken } = await signIn();

    advance(30 * 24 * 60 * 60 + 1);
    await expect(refreshSession(makeDeps(), refreshToken)).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe("logout", () => {
  it("revokes the presented token's whole family", async () => {
    const { authUid, refreshToken } = await signIn();

    await logout(makeDeps(), authUid, refreshToken);

    await expect(refreshSession(makeDeps(), refreshToken)).rejects.toMatchObject({
      status: 401,
    });
    const rows = await RefreshTokenModel.find({ authUid }).lean();
    expect(rows.every((row) => row.revokedAt !== undefined)).toBe(true);
  });

  it("refuses to revoke another identity's token", async () => {
    const { refreshToken } = await signIn();

    await expect(logout(makeDeps(), "someone-else", refreshToken)).rejects.toMatchObject({
      status: 403,
    });

    // The rightful owner's session is untouched.
    await expect(refreshSession(makeDeps(), refreshToken)).resolves.toBeDefined();
  });

  it("is idempotent for a token that no longer exists", async () => {
    await expect(logout(makeDeps(), "any-uid", "unknown-token")).resolves.toBeUndefined();
  });
});
