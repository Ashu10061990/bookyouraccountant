import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../platform/db.js";
import { ConfigModel } from "../modules/config/config.schema.js";
import { LeadModel } from "../modules/leads/leads.schema.js";
import { ServiceModel } from "../modules/services/services.schema.js";
import { UserModel } from "../modules/users/users.schema.js";
import { TOKENS, UIDS, as, buildTestApp } from "../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";

/**
 * # The security deliverable
 *
 * Spec §6.1:
 *
 * > Today there are two independent lines of defence: application code, and
 * > `firestore.rules`. Those rules encode genuine business logic. **A Node API
 * > removes the second layer.** Every rule in `firestore.rules` is
 * > re-implemented as an explicit service-layer guard with a unit test
 * > asserting the *denial*. This is a tracked deliverable with its own test
 * > file, not a side effect of writing endpoints.
 *
 * This is that file. Each test names the rule it replaces.
 *
 * Denials 1–9 mirror clauses in the legacy 375-line `firestore.rules`.
 * Denials 10–12 have **no legacy equivalent**: they are attack surface created
 * *by* moving to bearer-token auth, and a literal reading of "re-implement
 * every rule" would miss all three.
 *
 * Every test here has been mutation-verified — its guard removed, the test
 * confirmed to fail, the guard restored. Results are recorded in
 * FIRESTORE-RULES-PARITY.md. An untested guard and an unenforced guard look
 * identical from a green test run.
 */

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
    { firebaseUid: UIDS.accountant, role: "accountant", blocked: false },
    { firebaseUid: UIDS.other, role: "business", blocked: false },
  ]);
});

describe("1. a user cannot create themselves as admin", () => {
  // Legacy: match /users/{userId}
  //   allow create: if isOwner(userId)
  //                 && request.resource.data.role in ['business','accountant'];
  it("rejects role: admin at creation", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: as(TOKENS.stranger),
      payload: { role: "admin" },
    });

    expect(res.statusCode).toBe(400);
    expect(await UserModel.countDocuments({ role: "admin" })).toBe(1); // only the seeded one
  });
});

describe("2. a user cannot act on another user's record", () => {
  // Legacy: `isOwner(userId)` compared the auth uid to the document path.
  // There is no document path here — ownership comes from the token, and the
  // body is ignored.
  it("keys a created record to the token, not to a body-supplied uid", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: as(TOKENS.stranger),
      payload: { role: "business", firebaseUid: UIDS.admin },
    });

    // The admin's record is untouched and still admin.
    const admin = await UserModel.findOne({ firebaseUid: UIDS.admin });
    expect(admin?.role).toBe("admin");
    expect(await UserModel.countDocuments({ firebaseUid: UIDS.stranger })).toBe(1);
  });

  it("patches only the caller's own record", async () => {
    await app.inject({
      method: "PATCH",
      url: "/v1/users/me",
      headers: as(TOKENS.business),
      payload: { firebaseUid: UIDS.other, role: "accountant" },
    });

    expect((await UserModel.findOne({ firebaseUid: UIDS.business }))?.role).toBe("accountant");
    // The other user is untouched.
    expect((await UserModel.findOne({ firebaseUid: UIDS.other }))?.role).toBe("business");
  });
});

describe("3. a user cannot promote themselves to admin", () => {
  // Legacy: match /users/{userId}
  //   allow update: if isOwner(userId)
  //                 && (!('role' in request.resource.data)
  //                     || request.resource.data.role in ['business','accountant']);
  //
  // The realistic attack: register as a business, then PATCH yourself to admin.
  it("rejects a self-promotion PATCH and leaves the stored role unchanged", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/users/me",
      headers: as(TOKENS.business),
      payload: { role: "admin" },
    });

    expect(res.statusCode).toBe(400);
    expect((await UserModel.findOne({ firebaseUid: UIDS.business }))?.role).toBe("business");
  });
});

describe("4. config is not readable without signing in", () => {
  // Legacy: match /config/{docId} { allow read: if isSignedIn(); }
  it("rejects an unauthenticated read", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/config/platformFees" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    // And the rates themselves did not leak in the error body.
    expect(res.payload).not.toContain("takeRate");
  });
});

describe("5. config is not writable by a non-admin", () => {
  // Legacy: match /config/{docId} { allow write: if isAdmin(); }
  //
  // What this protects: config/platformFees holds the take rate, the GST rate
  // and the TDS threshold. A business that could write it could set its own
  // platform fee to zero.
  it.each([TOKENS.business, TOKENS.accountant])("rejects a write by %s", async (token) => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/config/platformFees",
      headers: as(token),
      payload: {
        takeRate: 0,
        gstOnFeeRate: 0,
        tdsRate: 0,
        gstTcsRate: 0,
        minFeePaise: 0,
        tdsThresholdPaise: 0,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(await ConfigModel.countDocuments()).toBe(0);
  });
});

describe("6. the service catalogue is not writable by a non-admin", () => {
  // Legacy: match /services/{id} { allow read: if true; allow write: if isAdmin(); }
  it.each([TOKENS.business, TOKENS.accountant])("rejects a create by %s", async (token) => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/services",
      headers: as(token),
      payload: { id: "forged", name: "Forged Service" },
    });

    expect(res.statusCode).toBe(403);
    expect(await ServiceModel.countDocuments({ id: "forged" })).toBe(0);
  });

  it("rejects a patch by a non-admin", async () => {
    await ServiceModel.create({ id: "audit", name: "Audit Support", active: true });

    const res = await app.inject({
      method: "PATCH",
      url: "/v1/services/audit",
      headers: as(TOKENS.business),
      payload: { name: "Renamed by a business" },
    });

    expect(res.statusCode).toBe(403);
    expect((await ServiceModel.findOne({ id: "audit" }))?.name).toBe("Audit Support");
  });
});

describe("7. a user cannot read another user's lead", () => {
  // Legacy: match /leads/{uid} { allow read: if isOwner(uid) || isAdmin(); }
  const VICTIM_PHONE = "+919999900000";

  beforeEach(async () => {
    await LeadModel.create([
      { firebaseUid: UIDS.business, mode: "register", completed: false, lastSeenAt: new Date() },
      {
        firebaseUid: UIDS.other,
        phone: VICTIM_PHONE,
        mode: "register",
        completed: true,
        lastSeenAt: new Date(),
      },
    ]);
  });

  it("returns the caller's own lead", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/leads/me",
      headers: as(TOKENS.business),
    });

    expect(res.json()).toMatchObject({ lead: { firebaseUid: UIDS.business } });
  });

  // This must *attempt* the attack, not merely observe the happy path.
  //
  // Found by mutation: the original test only fetched /v1/leads/me with no
  // parameters, so a handler changed to honour `?uid=` — the obvious way for
  // this guard to regress — still passed it. Asserting "I got my own lead"
  // does not assert "I could not get someone else's". Each channel below is a
  // way a caller could try to name a different user.
  it.each([
    ["a uid query parameter", `/v1/leads/me?uid=${UIDS.other}`],
    ["a firebaseUid query parameter", `/v1/leads/me?firebaseUid=${UIDS.other}`],
    ["a path-style override", `/v1/leads/me/${UIDS.other}`],
    ["a leads path for another uid", `/v1/leads/${UIDS.other}`],
  ])("never returns another user's lead via %s", async (_label, url) => {
    const res = await app.inject({ method: "GET", url, headers: as(TOKENS.business) });

    expect(res.payload).not.toContain(VICTIM_PHONE);
    expect(res.payload).not.toContain(UIDS.other);
  });

  it("never returns another user's lead when their uid is in the body", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/leads/me",
      headers: as(TOKENS.business),
      payload: { uid: UIDS.other, firebaseUid: UIDS.other },
    });

    expect(res.payload).not.toContain(VICTIM_PHONE);
    expect(res.payload).not.toContain(UIDS.other);
  });
});

describe("8. a user cannot write another user's lead", () => {
  // Legacy: match /leads/{uid} { allow create, update: if isOwner(uid); }
  it("ignores a body-supplied uid and writes only the caller's lead", async () => {
    await LeadModel.create({
      firebaseUid: UIDS.other,
      phone: "+919999900000",
      mode: "register",
      completed: false,
      lastSeenAt: new Date(),
    });

    await app.inject({
      method: "PUT",
      url: "/v1/leads/me",
      headers: as(TOKENS.business),
      payload: { firebaseUid: UIDS.other, phone: "+911111111111", completed: true },
    });

    const victim = await LeadModel.findOne({ firebaseUid: UIDS.other });
    expect(victim?.phone).toBe("+919999900000");
    expect(victim?.completed).toBe(false);
  });
});

describe("9. a non-admin cannot list every lead", () => {
  // Legacy: the isAdmin() half of the leads read rule. The list is every
  // captured phone number on the platform — a competitor's prospect list.
  it.each([TOKENS.business, TOKENS.accountant])("rejects a list by %s", async (token) => {
    await LeadModel.create({
      firebaseUid: UIDS.other,
      phone: "+919999900000",
      mode: "register",
      completed: false,
      lastSeenAt: new Date(),
    });

    const res = await app.inject({ method: "GET", url: "/v1/leads", headers: as(token) });

    expect(res.statusCode).toBe(403);
    expect(res.payload).not.toContain("+919999900000");
  });
});

/* ---------------------------------------------------------------------------
 * 10-12: no firestore.rules equivalent.
 *
 * These are new attack surface, created BY the move to a token-based API.
 * Firestore's SDK handled token verification and identity itself, so the rules
 * file never had to express "do not trust the client's claim about who it is".
 * Now the API does.
 * ------------------------------------------------------------------------ */

describe("10. an invalid token is rejected before any handler runs", () => {
  it.each([
    ["a forged token", "Bearer completely-made-up"],
    ["no scheme", "token-admin"],
    ["the wrong scheme", "Basic dXNlcjpwYXNz"],
    ["an empty bearer", "Bearer "],
  ])("rejects %s", async (_label, authorization) => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/leads",
      headers: { authorization },
    });

    expect(res.statusCode).toBe(401);
  });

  it("never reveals why the token failed", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/users/me",
      headers: { authorization: "Bearer completely-made-up" },
    });

    // The verifier's own message names the failure mode — "invalid
    // signature", "expired", "wrong audience" — which is a free oracle for
    // probing forgery.
    expect(res.payload).not.toContain("signature");
    expect(res.payload).not.toContain("Firebase");
    expect(res.payload).not.toContain("expired");
  });
});

describe("11. a role in the request body is ignored", () => {
  // Firestore rules never had to say this: the client SDK could not assert its
  // own identity. A JSON API can, and every field in the body is attacker
  // controlled.
  it("does not let a body field grant admin access to a config write", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/config/platformFees",
      headers: as(TOKENS.business),
      payload: {
        role: "admin",
        uid: UIDS.admin,
        firebaseUid: UIDS.admin,
        takeRate: 0,
        gstOnFeeRate: 0,
        tdsRate: 0,
        gstTcsRate: 0,
        minFeePaise: 0,
        tdsThresholdPaise: 0,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(await ConfigModel.countDocuments()).toBe(0);
  });

  it("does not let a body field grant admin access to the lead list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/leads",
      headers: as(TOKENS.business),
      payload: { role: "admin" },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe("12. a stale admin claim is denied", () => {
  // The sharpest of the three. Firebase custom claims are baked into a token
  // valid for an hour. Demote an admin and their existing token still says
  // role: admin and still verifies perfectly — so an API that trusted the
  // claim would keep granting admin access for up to an hour after revocation,
  // including to payouts and dispute overrides.
  //
  // TOKENS.stranger carries { role: "admin", admin: true }.
  it("denies a token claiming admin whose database record is not admin", async () => {
    await UserModel.create({ firebaseUid: UIDS.stranger, role: "business", blocked: false });

    const res = await app.inject({ method: "GET", url: "/v1/leads", headers: as(TOKENS.stranger) });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("denies a token claiming admin whose record does not exist at all", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/leads", headers: as(TOKENS.stranger) });

    expect(res.statusCode).toBe(401);
  });

  it("denies a blocked user even with an admin claim", async () => {
    await UserModel.create({ firebaseUid: UIDS.stranger, role: "admin", blocked: true });

    const res = await app.inject({ method: "GET", url: "/v1/leads", headers: as(TOKENS.stranger) });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "PROFILE_BLOCKED" } });
  });
});
