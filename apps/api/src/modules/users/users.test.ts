import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../../platform/db.js";
import { TOKENS, UIDS, as, buildTestApp } from "../../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../../test/mongo.js";
import { UserModel } from "./users.schema.js";

let app: FastifyInstance;

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();
  app = await buildTestApp();
}, 60_000);

afterAll(async () => {
  await app.close();
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
});

describe("POST /v1/users", () => {
  it("creates the caller's own record from a valid token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: as(TOKENS.business),
      payload: { role: "business" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      user: { firebaseUid: UIDS.business, role: "business", blocked: false },
    });
  });

  it("rejects an unauthenticated caller", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/users",
      payload: { role: "business" },
    });

    expect(res.statusCode).toBe(401);
  });

  // The legacy rule this replaces:
  //   allow create: if isOwner(userId)
  //                 && request.resource.data.role in ['business','accountant'];
  it("refuses to create an admin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: as(TOKENS.business),
      payload: { role: "admin" },
    });

    expect(res.statusCode).toBe(400);
    expect(await UserModel.countDocuments()).toBe(0);
  });

  // The other half of `isOwner`. There is no document path here, so ownership
  // is enforced by taking the uid from the token and ignoring the body — this
  // asserts the body genuinely has no effect.
  it("ignores a firebaseUid in the body and keys the record to the token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: as(TOKENS.business),
      payload: { role: "business", firebaseUid: UIDS.other },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ user: { firebaseUid: UIDS.business } });
    expect(await UserModel.findOne({ firebaseUid: UIDS.other })).toBeNull();
  });

  it("ignores a blocked flag in the body", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: as(TOKENS.business),
      payload: { role: "business", blocked: true },
    });

    const stored = await UserModel.findOne({ firebaseUid: UIDS.business });
    expect(stored?.blocked).toBe(false);
  });

  it("rejects a second record for the same identity with a 409", async () => {
    const payload = { role: "business" };
    await app.inject({ method: "POST", url: "/v1/users", headers: as(TOKENS.business), payload });

    const res = await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: as(TOKENS.business),
      payload,
    });

    expect(res.statusCode).toBe(409);
    expect(await UserModel.countDocuments({ firebaseUid: UIDS.business })).toBe(1);
  });

  it("rejects a malformed phone number", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: as(TOKENS.business),
      payload: { role: "business", phone: "9876543210" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /v1/users/me", () => {
  beforeEach(async () => {
    await UserModel.create({ firebaseUid: UIDS.business, role: "business", blocked: false });
  });

  it("returns the caller's own record", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/users/me",
      headers: as(TOKENS.business),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ user: { firebaseUid: UIDS.business } });
  });

  it("rejects an unauthenticated caller", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/users/me" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a valid token whose user has no record", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/users/me",
      headers: as(TOKENS.other),
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects a blocked user", async () => {
    await UserModel.create({ firebaseUid: UIDS.other, role: "business", blocked: true });

    const res = await app.inject({
      method: "GET",
      url: "/v1/users/me",
      headers: as(TOKENS.other),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "PROFILE_BLOCKED" } });
  });
});

describe("PATCH /v1/users/me", () => {
  beforeEach(async () => {
    await UserModel.create({ firebaseUid: UIDS.business, role: "business", blocked: false });
  });

  it("updates the caller's own record", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/users/me",
      headers: as(TOKENS.business),
      payload: { role: "accountant" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ user: { role: "accountant" } });
  });

  // The legacy update rule's role whitelist. This is the self-promotion path,
  // and the one an attacker would actually try: create as a business, then
  // patch yourself to admin.
  it("refuses to promote the caller to admin", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/users/me",
      headers: as(TOKENS.business),
      payload: { role: "admin" },
    });

    expect(res.statusCode).toBe(400);

    const stored = await UserModel.findOne({ firebaseUid: UIDS.business });
    expect(stored?.role).toBe("business");
  });

  it("cannot unblock itself", async () => {
    await UserModel.updateOne({ firebaseUid: UIDS.business }, { $set: { blocked: true } });

    const res = await app.inject({
      method: "PATCH",
      url: "/v1/users/me",
      headers: as(TOKENS.business),
      payload: { blocked: false },
    });

    // Blocked users cannot make requests at all — the guard runs first.
    expect(res.statusCode).toBe(403);
    expect((await UserModel.findOne({ firebaseUid: UIDS.business }))?.blocked).toBe(true);
  });

  it("cannot change its own firebaseUid to take over another identity", async () => {
    await UserModel.create({ firebaseUid: UIDS.other, role: "business", blocked: false });

    await app.inject({
      method: "PATCH",
      url: "/v1/users/me",
      headers: as(TOKENS.business),
      payload: { firebaseUid: UIDS.other },
    });

    // Both records still keyed to their own identity.
    expect(await UserModel.countDocuments({ firebaseUid: UIDS.business })).toBe(1);
    expect(await UserModel.countDocuments({ firebaseUid: UIDS.other })).toBe(1);
  });
});

describe("the firebaseUid unique index", () => {
  // The index is the last line of defence behind the 409: two concurrent
  // signups can both pass the "does it exist" check before either writes.
  it("rejects a duplicate identity at the database level", async () => {
    await UserModel.create({ firebaseUid: UIDS.business, role: "business", blocked: false });

    await expect(
      UserModel.create({ firebaseUid: UIDS.business, role: "accountant", blocked: false }),
    ).rejects.toThrow(/duplicate key/i);
  });
});
