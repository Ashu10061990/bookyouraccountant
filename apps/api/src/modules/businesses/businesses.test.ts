import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCipher } from "../../platform/crypto.js";
import { assertIndexes } from "../../platform/db.js";
import { localKms } from "../../platform/kms.js";
import { findBySubject } from "../audit/audit.service.js";
import { UserModel } from "../users/users.schema.js";
import { TOKENS, UIDS, as, buildTestApp } from "../../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../../test/mongo.js";
import { BusinessModel } from "./businesses.schema.js";

let app: FastifyInstance;

const ORG_PAN = "AAACB1234C";

const PROFILE = {
  fullName: "Ramesh Iyer",
  signatoryRole: "proprietor",
  email: "ramesh@example.com",
  phone: "+919812345678",
  orgName: "Iyer Traders",
  orgType: "proprietorship",
  gstin: "27ABCDE1234F1Z5",
  address: { line: "12 MG Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
  industry: "Wholesale",
  employees: "10-50",
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
    { firebaseUid: UIDS.admin, role: "admin", blocked: false },
    { firebaseUid: UIDS.business, role: "business", blocked: false },
    { firebaseUid: UIDS.other, role: "business", blocked: false },
    { firebaseUid: UIDS.accountant, role: "accountant", blocked: false },
  ]);
});

async function createBusiness(token: string = TOKENS.business): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/businesses",
    headers: as(token),
    payload: PROFILE,
  });
  expect(res.statusCode).toBe(201);
}

describe("POST /v1/businesses", () => {
  it("creates the caller's own profile", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/businesses",
      headers: as(TOKENS.business),
      payload: PROFILE,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      business: { firebaseUid: UIDS.business, orgName: "Iyer Traders", freeDayCouponUsed: false },
    });
  });

  it("rejects an unauthenticated caller", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/businesses", payload: PROFILE });
    expect(res.statusCode).toBe(401);
  });

  // Legacy: `request.resource.data.uid == bizId`. There is no document path
  // here, so identity comes from the token and the body cannot name another.
  it("ignores a firebaseUid in the body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/businesses",
      headers: as(TOKENS.business),
      payload: { ...PROFILE, firebaseUid: UIDS.other },
    });

    expect(res.statusCode).toBe(403);
    expect(await BusinessModel.countDocuments({ firebaseUid: UIDS.other })).toBe(0);
  });

  // §12.2: the first day is free, once. A business setting this itself would
  // be claiming a free day it has already spent — or denying itself one.
  it("refuses a payload that sets freeDayCouponUsed", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/businesses",
      headers: as(TOKENS.business),
      payload: { ...PROFILE, freeDayCouponUsed: true },
    });

    expect(res.statusCode).toBe(403);
  });

  it("rejects a malformed GSTIN", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/businesses",
      headers: as(TOKENS.business),
      payload: { ...PROFILE, gstin: "27ABCDE" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects a pincode that starts with zero", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/businesses",
      headers: as(TOKENS.business),
      payload: { ...PROFILE, address: { ...PROFILE.address, pincode: "011001" } },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects a second profile for the same identity", async () => {
    await createBusiness();

    const res = await app.inject({
      method: "POST",
      url: "/v1/businesses",
      headers: as(TOKENS.business),
      payload: PROFILE,
    });

    expect(res.statusCode).toBe(409);
  });
});

describe("reading a business — owner and admin only", () => {
  beforeEach(async () => {
    await createBusiness();
  });

  it("lets the owner read their own", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/businesses/me",
      headers: as(TOKENS.business),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ business: { orgName: "Iyer Traders" } });
  });

  it("lets an admin read any", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/businesses/${UIDS.business}`,
      headers: as(TOKENS.admin),
    });

    expect(res.statusCode).toBe(200);
  });

  // Legacy: `allow read: if isOwner(bizId) || isAdmin()`. An accountant learns
  // a client's details through the assignment connecting them, not by fetching
  // a profile.
  it("denies another business", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/businesses/${UIDS.business}`,
      headers: as(TOKENS.other),
    });

    expect(res.statusCode).toBe(403);
    expect(res.payload).not.toContain("Iyer Traders");
  });

  it("denies an accountant", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/businesses/${UIDS.business}`,
      headers: as(TOKENS.accountant),
    });

    expect(res.statusCode).toBe(403);
    expect(res.payload).not.toContain("Iyer Traders");
  });

  it("denies an unauthenticated caller", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/businesses/${UIDS.business}` });

    expect(res.statusCode).toBe(401);
    expect(res.payload).not.toContain("Iyer Traders");
  });

  // There is deliberately no list endpoint. The cheapest way to guarantee
  // businesses are never browsable is for no route to exist that returns more
  // than one.
  it("has no listing endpoint at all", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/businesses",
      headers: as(TOKENS.admin),
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("the organisation PAN", () => {
  beforeEach(async () => {
    await createBusiness();
  });

  it("is stored encrypted and returned masked", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/businesses/me/org-pan",
      headers: as(TOKENS.business),
      payload: { orgPan: ORG_PAN },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ business: { orgPanMasked: "XXXXX1234C" } });
    expect(res.payload).not.toContain(ORG_PAN);

    const stored = await BusinessModel.findOne({ firebaseUid: UIDS.business }).lean();
    expect(JSON.stringify(stored)).not.toContain(ORG_PAN);
    expect(stored?.orgPanSealed?.ciphertext).toBeTruthy();
  });

  // The legacy rule made orgPanEncrypted immutable through the profile update
  // path, and its own comment admits the check was fragile. Here the field is
  // simply unreachable from that path.
  it("cannot be set or cleared through the profile update path", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/businesses/me/org-pan",
      headers: as(TOKENS.business),
      payload: { orgPan: ORG_PAN },
    });

    const res = await app.inject({
      method: "PATCH",
      url: "/v1/businesses/me",
      headers: as(TOKENS.business),
      payload: { orgPanMasked: "XXXXX9999Z", orgPanSealed: null },
    });

    expect(res.statusCode).toBe(403);

    const stored = await BusinessModel.findOne({ firebaseUid: UIDS.business });
    expect(stored?.orgPanMasked).toBe("XXXXX1234C");
    expect(stored?.orgPanSealed).toBeDefined();
  });

  it("records the submission in the audit log without the value", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/businesses/me/org-pan",
      headers: as(TOKENS.business),
      payload: { orgPan: ORG_PAN },
    });

    const [entry] = await findBySubject("business", UIDS.business);
    expect(entry).toMatchObject({ action: "kyc.write", actorUid: UIDS.business });
    expect(JSON.stringify(entry)).not.toContain(ORG_PAN);
  });

  it("is readable in plaintext only by an admin, and the read is audited", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/businesses/me/org-pan",
      headers: as(TOKENS.business),
      payload: { orgPan: ORG_PAN },
    });

    const denied = await app.inject({
      method: "GET",
      url: `/v1/businesses/${UIDS.business}/org-pan`,
      headers: as(TOKENS.business),
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.payload).not.toContain(ORG_PAN);

    const allowed = await app.inject({
      method: "GET",
      url: `/v1/businesses/${UIDS.business}/org-pan`,
      headers: as(TOKENS.admin),
    });
    expect(allowed.json()).toEqual({ orgPan: ORG_PAN });

    const reads = (await findBySubject("business", UIDS.business)).filter(
      (entry) => entry.action === "kyc.read",
    );
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ actorUid: UIDS.admin });
  });

  it("rejects a malformed PAN", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/businesses/me/org-pan",
      headers: as(TOKENS.business),
      payload: { orgPan: "NOTAPAN" },
    });

    expect(res.statusCode).toBe(400);
  });
});
