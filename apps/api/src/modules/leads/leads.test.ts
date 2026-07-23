import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../../platform/db.js";
import { UserModel } from "../users/users.schema.js";
import { TOKENS, UIDS, as, buildTestApp } from "../../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../../test/mongo.js";
import { LeadModel } from "./leads.schema.js";

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
  await UserModel.create([
    { firebaseUid: UIDS.admin, role: "admin", blocked: false },
    { firebaseUid: UIDS.business, role: "business", blocked: false },
    { firebaseUid: UIDS.other, role: "business", blocked: false },
  ]);
});

describe("PUT /v1/leads/me", () => {
  it("captures a lead for the caller", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/leads/me",
      headers: as(TOKENS.business),
      payload: { phone: "+919876543210", role: "business" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      lead: { firebaseUid: UIDS.business, completed: false, mode: "register" },
    });
  });

  // Capture happens at OTP, before the user has picked a side or finished
  // registering — so it must work with only a verified token.
  it("works before the user has any user record", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/leads/me",
      headers: as(TOKENS.stranger),
      payload: { phone: "+919876500000" },
    });

    expect(res.statusCode).toBe(200);
    expect(await UserModel.countDocuments({ firebaseUid: UIDS.stranger })).toBe(0);
  });

  it("rejects an unauthenticated caller", async () => {
    const res = await app.inject({ method: "PUT", url: "/v1/leads/me", payload: {} });
    expect(res.statusCode).toBe(401);
  });

  // Legacy rule: `allow create, update: if isOwner(uid)`.
  it("ignores a firebaseUid in the body and keys the lead to the token", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/leads/me",
      headers: as(TOKENS.business),
      payload: { firebaseUid: UIDS.other, phone: "+919876543210" },
    });

    expect(await LeadModel.countDocuments({ firebaseUid: UIDS.business })).toBe(1);
    expect(await LeadModel.countDocuments({ firebaseUid: UIDS.other })).toBe(0);
  });

  // Matches the legacy setDoc(..., { merge: true }): re-entering the funnel
  // updates the lead rather than colliding with it.
  it("upserts, so a repeat capture updates instead of duplicating", async () => {
    const url = "/v1/leads/me";
    await app.inject({
      method: "PUT",
      url,
      headers: as(TOKENS.business),
      payload: { phone: "+919876543210" },
    });
    const second = await app.inject({
      method: "PUT",
      url,
      headers: as(TOKENS.business),
      payload: { phone: "+919876543210", completed: true },
    });

    expect(second.statusCode).toBe(200);
    expect(await LeadModel.countDocuments({ firebaseUid: UIDS.business })).toBe(1);
    expect(second.json()).toMatchObject({ lead: { completed: true } });
  });

  it("rejects admin as a lead role", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/leads/me",
      headers: as(TOKENS.business),
      payload: { role: "admin" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /v1/leads/me", () => {
  it("returns only the caller's own lead", async () => {
    await LeadModel.create([
      { firebaseUid: UIDS.business, mode: "register", completed: false, lastSeenAt: new Date() },
      { firebaseUid: UIDS.other, mode: "register", completed: true, lastSeenAt: new Date() },
    ]);

    const res = await app.inject({
      method: "GET",
      url: "/v1/leads/me",
      headers: as(TOKENS.business),
    });

    expect(res.json()).toMatchObject({ lead: { firebaseUid: UIDS.business } });
    // There is no route that accepts another user's id at all, so the only
    // way to read someone else's lead would be a bug in this handler.
    expect(res.payload).not.toContain(UIDS.other);
  });

  it("404s when no lead was captured", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/leads/me",
      headers: as(TOKENS.business),
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("GET /v1/leads", () => {
  beforeEach(async () => {
    await LeadModel.create([
      { firebaseUid: UIDS.business, mode: "register", completed: false, lastSeenAt: new Date() },
      { firebaseUid: UIDS.other, mode: "register", completed: true, lastSeenAt: new Date() },
    ]);
  });

  // Legacy rule: `allow read: if isOwner(uid) || isAdmin()`. The list view is
  // the admin half.
  it("allows an admin to list every lead", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/leads", headers: as(TOKENS.admin) });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ leads: unknown[] }>().leads).toHaveLength(2);
  });

  it("denies a non-admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/leads",
      headers: as(TOKENS.business),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("denies an unauthenticated caller", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/leads" });
    expect(res.statusCode).toBe(401);
  });

  // TOKENS.stranger carries `{ role: "admin", admin: true }` as claims but has
  // no user record at all. If the claim were trusted anywhere, this would
  // return the full lead list — every captured phone number in the system.
  it("denies a token whose claims say admin but whose record does not exist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/leads",
      headers: as(TOKENS.stranger),
    });

    expect(res.statusCode).toBe(401);
    expect(res.payload).not.toContain(UIDS.business);
  });
});
