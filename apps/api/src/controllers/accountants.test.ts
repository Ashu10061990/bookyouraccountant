import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCipher } from "../helpers/crypto.helper.js";
import { assertIndexes } from "../config/db.js";
import { localKms } from "../integrations/kms.js";
import { findBySubject } from "../services/audit.service.js";
import { UserModel } from "../models/user.model.js";
import { TOKENS, UIDS, as, buildTestApp } from "../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";
import { AccountantModel } from "../models/accountant.model.js";

let app: FastifyInstance;

const PAN = "ABCDE1234F";
const ACCOUNT_NUMBER = "50100123456789";

const PROFILE = {
  name: "Asha Menon",
  email: "asha@example.com",
  phone: "+919876543210",
  city: "Kochi",
  state: "Kerala",
  bio: "Twelve years in GST and statutory audit.",
  qualifications: ["ca"],
  experienceYears: 12,
  specialties: ["bookkeeping", "gst"],
  languages: ["english", "malayalam"],
};

const KYC = {
  pan: PAN,
  bankAccountNumber: ACCOUNT_NUMBER,
  ifsc: "HDFC0001234",
  bankAccountHolderName: "Asha Menon",
};

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();
  app = await buildTestApp({}, createCipher(localKms(randomBytes(32))));
}, 60_000);

afterAll(async () => {
  await app.close();
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
  await UserModel.create([
    { authUid: UIDS.admin, role: "admin", blocked: false },
    { authUid: UIDS.accountant, role: "accountant", blocked: false },
    { authUid: UIDS.business, role: "business", blocked: false },
    { authUid: UIDS.other, role: "accountant", blocked: false },
  ]);
});

async function createProfile(token: string = TOKENS.accountant): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/accountants",
    headers: as(token),
    payload: PROFILE,
  });
  expect(res.statusCode).toBe(201);
}

async function submitKyc(token: string = TOKENS.accountant): Promise<void> {
  const res = await app.inject({
    method: "PUT",
    url: "/v1/accountants/me/kyc",
    headers: as(token),
    payload: KYC,
  });
  expect(res.statusCode).toBe(200);
}

describe("POST /v1/accountants", () => {
  it("creates the caller's own profile", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/accountants",
      headers: as(TOKENS.accountant),
      payload: PROFILE,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      accountant: { authUid: UIDS.accountant, name: "Asha Menon", verified: false },
    });
  });

  // Verification is the gate to paid work, which makes it the single most
  // valuable field in the system to forge. Legacy rule:
  //   !('verified' in req && req.verified == true)
  it("refuses a profile that tries to arrive verified", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/accountants",
      headers: as(TOKENS.accountant),
      payload: { ...PROFILE, verified: true },
    });

    expect(res.statusCode).toBe(403);
    expect(await AccountantModel.countDocuments()).toBe(0);
  });

  it.each([
    ["examScore", { examScore: 100 }],
    ["examTotal", { examTotal: 100 }],
    ["rating", { rating: 5 }],
    ["reviewsCount", { reviewsCount: 99 }],
    ["authUid", { authUid: UIDS.other }],
  ])("refuses a profile that tries to set %s", async (_label, extra) => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/accountants",
      headers: as(TOKENS.accountant),
      payload: { ...PROFILE, ...extra },
    });

    expect(res.statusCode).toBe(403);
    expect(await AccountantModel.countDocuments()).toBe(0);
  });

  it("rejects an unauthenticated caller", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/accountants", payload: PROFILE });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a second profile for the same identity", async () => {
    await createProfile();

    const res = await app.inject({
      method: "POST",
      url: "/v1/accountants",
      headers: as(TOKENS.accountant),
      payload: PROFILE,
    });

    expect(res.statusCode).toBe(409);
  });
});

describe("PATCH /v1/accountants/me", () => {
  beforeEach(async () => {
    await createProfile();
  });

  it("updates the caller's own profile", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/accountants/me",
      headers: as(TOKENS.accountant),
      payload: { city: "Bengaluru" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ accountant: { city: "Bengaluru" } });
  });

  // The legacy update rule's whole purpose:
  //   !diff.affectedKeys().hasAny(['verified','examScore','examTotal','rating','reviewsCount'])
  it.each([
    ["verified", { verified: true }],
    ["examScore", { examScore: 100 }],
    ["rating", { rating: 5 }],
    ["reviewsCount", { reviewsCount: 99 }],
  ])("refuses to let an accountant set their own %s", async (field, payload) => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/accountants/me",
      headers: as(TOKENS.accountant),
      payload,
    });

    expect(res.statusCode).toBe(403);

    const stored = await AccountantModel.findOne({ authUid: UIDS.accountant });
    expect(stored?.[field as "verified"]).not.toBe(payload[field as keyof typeof payload]);
  });
});

/**
 * Spec §18 accepted risk, live in production on the frozen app:
 * "accountants read rule allows public reads — bank account numbers, IFSC
 * codes, phone and email of every verified accountant are world-readable."
 *
 * These are the tests that keep the rebuild from reproducing it.
 */
describe("the public listing does not leak what the legacy rule leaked", () => {
  beforeEach(async () => {
    await createProfile();
    await submitKyc();
    await app.inject({
      method: "POST",
      url: `/v1/accountants/${UIDS.accountant}/verify`,
      headers: as(TOKENS.admin),
      payload: { examScore: 82, examTotal: 100 },
    });
  });

  it("is readable with no token at all, like the marketing showcase", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/accountants" });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ accountants: unknown[] }>().accountants).toHaveLength(1);
  });

  it.each([
    ["bank account number", ACCOUNT_NUMBER],
    ["masked bank account", "XXXXXXXXXX6789"],
    ["IFSC", "HDFC0001234"],
    ["PAN", PAN],
    ["masked PAN", "XXXXX1234F"],
    ["phone", "+919876543210"],
    ["email", "asha@example.com"],
  ])("never includes the %s", async (_label, secret) => {
    const anonymous = await app.inject({ method: "GET", url: "/v1/accountants" });
    const signedIn = await app.inject({
      method: "GET",
      url: "/v1/accountants",
      headers: as(TOKENS.business),
    });

    expect(anonymous.payload).not.toContain(secret);
    expect(signedIn.payload).not.toContain(secret);
  });

  it("omits unverified accountants entirely", async () => {
    await createProfile(TOKENS.other);

    const res = await app.inject({ method: "GET", url: "/v1/accountants" });
    expect(res.json<{ accountants: unknown[] }>().accountants).toHaveLength(1);
  });
});

describe("GET /v1/accountants/:uid", () => {
  beforeEach(async () => {
    await createProfile();
    await submitKyc();
  });

  it("gives a signed-out visitor the public view", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/accountants/${UIDS.accountant}` });

    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toContain("asha@example.com");
    expect(res.payload).not.toContain("HDFC0001234");
  });

  // The half the legacy rule got wrong: signed in is not the same as entitled.
  it("gives another signed-in user the public view, not the private one", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}`,
      headers: as(TOKENS.business),
    });

    expect(res.payload).not.toContain("asha@example.com");
    expect(res.payload).not.toContain("XXXXX1234F");
  });

  it("gives the owner their own contact details and masked KYC", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}`,
      headers: as(TOKENS.accountant),
    });

    const body = res.json<{ accountant: { email?: string; kyc?: { panMasked: string } } }>();
    expect(body.accountant.email).toBe("asha@example.com");
    expect(body.accountant.kyc?.panMasked).toBe("XXXXX1234F");
    // Masked, never the value.
    expect(res.payload).not.toContain(PAN);
    expect(res.payload).not.toContain(ACCOUNT_NUMBER);
  });

  it("gives an admin the private view", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}`,
      headers: as(TOKENS.admin),
    });

    expect(res.json<{ accountant: { kyc?: unknown } }>().accountant.kyc).toBeDefined();
    expect(res.payload).not.toContain(PAN);
  });

  it("treats an unusable token as anonymous rather than failing", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}`,
      headers: { authorization: "Bearer forged" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toContain("asha@example.com");
  });
});

describe("KYC storage", () => {
  beforeEach(async () => {
    await createProfile();
  });

  it("stores the PAN encrypted, never in plaintext", async () => {
    await submitKyc();

    const stored = await AccountantModel.findOne({ authUid: UIDS.accountant }).lean();
    const serialised = JSON.stringify(stored);

    // The assertion that matters. If the PAN appeared here, every other
    // protection in this module would be decorative.
    expect(serialised).not.toContain(PAN);
    expect(serialised).not.toContain(ACCOUNT_NUMBER);
    expect(stored?.kyc?.panMasked).toBe("XXXXX1234F");
    expect(stored?.kyc?.panSealed.ciphertext).toBeTruthy();
  });

  it("records the submission in the audit log without the values", async () => {
    await submitKyc();

    const [entry] = await findBySubject("accountant", UIDS.accountant);
    expect(entry).toMatchObject({ action: "kyc.write", actorUid: UIDS.accountant });
    expect(JSON.stringify(entry)).not.toContain(PAN);
  });

  it("rejects a malformed PAN", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/accountants/me/kyc",
      headers: as(TOKENS.accountant),
      payload: { ...KYC, pan: "NOTAPAN" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects a malformed IFSC", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/accountants/me/kyc",
      headers: as(TOKENS.accountant),
      payload: { ...KYC, ifsc: "hdfc1234" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects an unauthenticated submission", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/accountants/me/kyc",
      payload: KYC,
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("GET /v1/accountants/:uid/kyc — the only path to plaintext", () => {
  beforeEach(async () => {
    await createProfile();
    await submitKyc();
  });

  it("denies an unauthenticated caller", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}/kyc`,
    });

    expect(res.statusCode).toBe(401);
    expect(res.payload).not.toContain(PAN);
  });

  // The owner may see their PAN masked on their profile, but the decrypted
  // value is an administrative act — it exists for payouts and verification,
  // not for browsing.
  it("denies the accountant their own decrypted KYC", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}/kyc`,
      headers: as(TOKENS.accountant),
    });

    expect(res.statusCode).toBe(403);
    expect(res.payload).not.toContain(PAN);
  });

  it("denies another accountant", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}/kyc`,
      headers: as(TOKENS.other),
    });

    expect(res.statusCode).toBe(403);
    expect(res.payload).not.toContain(PAN);
  });

  it("allows an admin and round-trips the encrypted values", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}/kyc`,
      headers: as(TOKENS.admin),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ kyc: { pan: PAN, bankAccountNumber: ACCOUNT_NUMBER } });
  });

  // §6.7 names "every KYC access" as auditable. This is the assertion that
  // makes an unaudited read impossible without editing the service.
  it("writes an audit entry naming the admin who read it", async () => {
    await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}/kyc`,
      headers: as(TOKENS.admin),
    });

    const reads = (await findBySubject("accountant", UIDS.accountant)).filter(
      (entry) => entry.action === "kyc.read",
    );

    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ actorUid: UIDS.admin, actorRole: "admin" });
    expect(JSON.stringify(reads[0])).not.toContain(PAN);
  });

  it("writes no audit entry when the read is denied", async () => {
    await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}/kyc`,
      headers: as(TOKENS.other),
    });

    const reads = (await findBySubject("accountant", UIDS.accountant)).filter(
      (entry) => entry.action === "kyc.read",
    );

    expect(reads).toHaveLength(0);
  });
});

describe("POST /v1/accountants/:uid/verify", () => {
  beforeEach(async () => {
    await createProfile();
  });

  it("denies a non-admin", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/accountants/${UIDS.accountant}/verify`,
      headers: as(TOKENS.accountant),
      payload: { examScore: 90, examTotal: 100 },
    });

    expect(res.statusCode).toBe(403);
    expect((await AccountantModel.findOne({ authUid: UIDS.accountant }))?.verified).toBe(false);
  });

  it("allows an admin and records who granted it", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/accountants/${UIDS.accountant}/verify`,
      headers: as(TOKENS.admin),
      payload: { examScore: 82, examTotal: 100 },
    });

    expect(res.statusCode).toBe(200);

    const stored = await AccountantModel.findOne({ authUid: UIDS.accountant });
    expect(stored?.verified).toBe(true);
    expect(stored?.verifiedBy).toBe(UIDS.admin);
    expect(stored?.examScore).toBe(82);

    const [entry] = (await findBySubject("accountant", UIDS.accountant)).filter(
      (e) => e.action === "accountant.verify",
    );
    expect(entry).toMatchObject({ actorUid: UIDS.admin });
  });

  // The precondition is in the query, so two admins acting at once produce one
  // verification and one audit entry — not two of either.
  it("is idempotent: a second verification is a conflict", async () => {
    const url = `/v1/accountants/${UIDS.accountant}/verify`;
    await app.inject({ method: "POST", url, headers: as(TOKENS.admin), payload: {} });

    const second = await app.inject({
      method: "POST",
      url,
      headers: as(TOKENS.admin),
      payload: {},
    });

    expect(second.statusCode).toBe(409);

    const entries = (await findBySubject("accountant", UIDS.accountant)).filter(
      (e) => e.action === "accountant.verify",
    );
    expect(entries).toHaveLength(1);
  });

  it("404s for an accountant that does not exist", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/accountants/uid-nobody/verify",
      headers: as(TOKENS.admin),
      payload: {},
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("when no KMS key is configured", () => {
  it("fails loudly rather than storing KYC in plaintext", async () => {
    // Deliberately built with no cipher, as a server with KMS_MASTER_KEY unset.
    const unconfigured = await buildTestApp();

    try {
      await UserModel.create({
        authUid: UIDS.stranger,
        role: "accountant",
        blocked: false,
      });
      await unconfigured.inject({
        method: "POST",
        url: "/v1/accountants",
        headers: as(TOKENS.stranger),
        payload: PROFILE,
      });

      const res = await unconfigured.inject({
        method: "PUT",
        url: "/v1/accountants/me/kyc",
        headers: as(TOKENS.stranger),
        payload: KYC,
      });

      // 503, not 200. Silently storing plaintext is the one outcome that must
      // not exist: the request would succeed, the data would land, and nobody
      // would learn it was unencrypted until someone read the collection.
      expect(res.statusCode).toBe(503);

      const stored = await AccountantModel.findOne({ authUid: UIDS.stranger }).lean();
      expect(stored?.kyc).toBeUndefined();
      expect(JSON.stringify(stored)).not.toContain(PAN);
    } finally {
      await unconfigured.close();
    }
  });
});
