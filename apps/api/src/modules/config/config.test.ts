import { PAYOUT_RATES } from "@bya/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../../platform/db.js";
import { UserModel } from "../users/users.schema.js";
import { TOKENS, UIDS, as, buildTestApp } from "../../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../../test/mongo.js";
import { ConfigModel } from "./config.schema.js";
import { findBySubject } from "../audit/audit.service.js";

let app: FastifyInstance;

const VALID_FEES = {
  takeRate: 0.15,
  gstOnFeeRate: 0.18,
  tdsRate: 0.001,
  gstTcsRate: 0.005,
  minFeePaise: 25_000,
  tdsThresholdPaise: 50_000_000,
};

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
  ]);
});

describe("GET /v1/config/:name", () => {
  // Legacy rule: `allow read: if isSignedIn()`.
  it("denies an unauthenticated caller", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/config/platformFees" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it.each([TOKENS.business, TOKENS.accountant, TOKENS.admin])(
    "allows any signed-in role (%s)",
    async (token) => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/config/platformFees",
        headers: as(token),
      });

      expect(res.statusCode).toBe(200);
    },
  );

  // Mirrors the legacy `{ ...PAYOUT_DEFAULTS, ...(snap.exists ? snap.data() : {}) }`:
  // the payout engine must have rates on day one, before any admin has
  // written the document.
  it("falls back to the shipped defaults when nothing has been written", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/config/platformFees",
      headers: as(TOKENS.business),
    });

    expect(res.json()).toMatchObject({ config: { value: PAYOUT_RATES } });
  });

  it("returns the stored document once one exists", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/config/platformFees",
      headers: as(TOKENS.admin),
      payload: VALID_FEES,
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/config/platformFees",
      headers: as(TOKENS.business),
    });

    expect(res.json()).toMatchObject({ config: { value: { takeRate: 0.15 } } });
  });

  // An admin typo must not mint a second document. The payout engine reads one
  // exact name, and would keep using defaults while the operator believed the
  // rates had changed.
  it("404s on an unknown document rather than inventing one", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/config/platformFee",
      headers: as(TOKENS.admin),
    });

    expect(res.statusCode).toBe(404);
    expect(await ConfigModel.countDocuments()).toBe(0);
  });
});

describe("PUT /v1/config/:name", () => {
  // Legacy rule: `allow write: if isAdmin()`.
  it("denies an unauthenticated caller", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/config/platformFees",
      payload: VALID_FEES,
    });

    expect(res.statusCode).toBe(401);
  });

  it.each([TOKENS.business, TOKENS.accountant])("denies a non-admin (%s)", async (token) => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/config/platformFees",
      headers: as(token),
      payload: VALID_FEES,
    });

    expect(res.statusCode).toBe(403);
    expect(await ConfigModel.countDocuments()).toBe(0);
  });

  it("allows an admin and records who wrote it", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/config/platformFees",
      headers: as(TOKENS.admin),
      payload: VALID_FEES,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ config: { updatedBy: UIDS.admin } });
  });

  // The reason each document has its own schema. One permissive shape would
  // let a compliance calendar be saved over the payout rates, and the engine
  // would then read every rate as undefined — paying out nothing, or
  // everything.
  it("refuses a compliance calendar posted to platformFees", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/config/platformFees",
      headers: as(TOKENS.admin),
      payload: { extensions: [], verifiedOn: "2026-07-23" },
    });

    expect(res.statusCode).toBe(400);
    expect(await ConfigModel.countDocuments()).toBe(0);
  });

  it("refuses payout rates posted to complianceOverrides", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/config/complianceOverrides",
      headers: as(TOKENS.admin),
      payload: VALID_FEES,
    });

    expect(res.statusCode).toBe(400);
  });

  // 12 instead of 0.12 — a percentage entered where a proportion was expected.
  // Unchecked, that is a hundredfold fee on real money.
  it("refuses a take rate above 1", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/config/platformFees",
      headers: as(TOKENS.admin),
      payload: { ...VALID_FEES, takeRate: 12 },
    });

    expect(res.statusCode).toBe(400);
  });

  it("accepts a valid compliance override", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/config/complianceOverrides",
      headers: as(TOKENS.admin),
      payload: {
        extensions: [{ match: "GSTR-3B", from: "2026-07-20", to: "2026-07-27", note: "CBIC" }],
        verifiedOn: "2026-07-23",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      config: { value: { extensions: [{ match: "GSTR-3B" }] } },
    });
  });

  // §6.7 covers "every admin override". Changing platformFees changes what
  // every accountant is paid, so it is the clearest example in this phase.
  it("writes an audit entry naming the admin who changed the rates", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/config/platformFees",
      headers: as(TOKENS.admin),
      payload: VALID_FEES,
    });

    const [entry] = await findBySubject("config", "platformFees");
    expect(entry).toMatchObject({
      action: "config.update",
      actorUid: UIDS.admin,
      actorRole: "admin",
    });
  });

  // The transactional half. A rejected write must leave no audit entry
  // claiming it happened — an audit log with phantom entries is worse than
  // none, because it is trusted.
  it("writes no audit entry when the write is rejected", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/config/platformFees",
      headers: as(TOKENS.admin),
      payload: { ...VALID_FEES, takeRate: 12 },
    });

    expect(await findBySubject("config", "platformFees")).toHaveLength(0);
  });

  it("writes no audit entry when a non-admin is denied", async () => {
    await app.inject({
      method: "PUT",
      url: "/v1/config/platformFees",
      headers: as(TOKENS.business),
      payload: VALID_FEES,
    });

    expect(await findBySubject("config", "platformFees")).toHaveLength(0);
  });

  it("overwrites rather than duplicating on a second write", async () => {
    const url = "/v1/config/platformFees";
    await app.inject({ method: "PUT", url, headers: as(TOKENS.admin), payload: VALID_FEES });
    await app.inject({
      method: "PUT",
      url,
      headers: as(TOKENS.admin),
      payload: { ...VALID_FEES, takeRate: 0.2 },
    });

    expect(await ConfigModel.countDocuments({ name: "platformFees" })).toBe(1);
  });
});
