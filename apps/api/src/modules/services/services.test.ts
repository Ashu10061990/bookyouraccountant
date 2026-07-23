import { SERVICES } from "@bya/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../../platform/db.js";
import { UserModel } from "../users/users.schema.js";
import { TOKENS, UIDS, as, buildTestApp } from "../../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../../test/mongo.js";
import { seedServices } from "./services.service.js";

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
  // Roles live in the database, so every test that needs one seeds it there.
  await UserModel.create([
    { firebaseUid: UIDS.admin, role: "admin", blocked: false },
    { firebaseUid: UIDS.business, role: "business", blocked: false },
  ]);
});

describe("GET /v1/services", () => {
  // Legacy rule: `allow read: if true` — the marketing site lists services to
  // signed-out visitors.
  it("is public, requiring no token at all", async () => {
    await seedServices();
    const res = await app.inject({ method: "GET", url: "/v1/services" });

    expect(res.statusCode).toBe(200);
  });

  it("returns all seven services, not the one the legacy fallback shipped", async () => {
    await seedServices();
    const res = await app.inject({ method: "GET", url: "/v1/services" });

    const body = res.json<{ services: { id: string }[] }>();
    expect(body.services).toHaveLength(7);
    expect(body.services.map((s) => s.id).sort()).toEqual(SERVICES.map((s) => s.id).sort());
  });

  it("omits inactive services", async () => {
    await seedServices();
    await app.inject({
      method: "PATCH",
      url: "/v1/services/audit",
      headers: as(TOKENS.admin),
      payload: { active: false },
    });

    const res = await app.inject({ method: "GET", url: "/v1/services" });
    const body = res.json<{ services: { id: string }[] }>();

    expect(body.services).toHaveLength(6);
    expect(body.services.map((s) => s.id)).not.toContain("audit");
  });
});

describe("POST /v1/services", () => {
  const NEW_SERVICE = { id: "valuation", name: "Business Valuation" };

  // Legacy rule: `allow write: if isAdmin()`.
  it("rejects an unauthenticated caller", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/services", payload: NEW_SERVICE });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("rejects a signed-in non-admin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/services",
      headers: as(TOKENS.business),
      payload: NEW_SERVICE,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("allows an admin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/services",
      headers: as(TOKENS.admin),
      payload: NEW_SERVICE,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ service: { id: "valuation", active: true } });
  });

  it("rejects a duplicate id with a 409 rather than a driver error", async () => {
    await seedServices();
    const res = await app.inject({
      method: "POST",
      url: "/v1/services",
      headers: as(TOKENS.admin),
      payload: { id: "audit", name: "Audit Support" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: "CONFLICT" } });
  });

  it("rejects an id that is not a slug", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/services",
      headers: as(TOKENS.admin),
      payload: { id: "Business Valuation", name: "x" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /v1/services/:id", () => {
  it("rejects a non-admin", async () => {
    await seedServices();
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/services/audit",
      headers: as(TOKENS.business),
      payload: { name: "Renamed" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("404s on a service that does not exist", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/services/nonexistent",
      headers: as(TOKENS.admin),
      payload: { name: "x" },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("seedServices", () => {
  it("creates all seven on an empty database", async () => {
    expect(await seedServices()).toEqual({ created: 7, existing: 0 });
  });

  // Runs on every deploy, so a second run must not duplicate the catalogue.
  it("is idempotent — a second run creates nothing", async () => {
    await seedServices();

    expect(await seedServices()).toEqual({ created: 0, existing: 7 });

    const res = await app.inject({ method: "GET", url: "/v1/services" });
    expect(res.json<{ services: unknown[] }>().services).toHaveLength(7);
  });
});
