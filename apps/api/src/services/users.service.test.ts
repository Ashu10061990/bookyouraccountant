import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../config/db.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";
import { UserModel } from "../models/user.model.js";
import { createUser, updateOwnUser } from "./users.service.js";

/**
 * Service-layer tests that bypass the HTTP route entirely.
 *
 * Role escalation is guarded twice — once by `createUserSchema`, which will not
 * parse `role: "admin"`, and once by `assertSelfAssignable` in the service. The
 * integration tests go through the route, so the schema catches the attempt
 * first and the service guard never runs. That makes the service guard
 * invisible to them: it could be deleted and every route test would stay green.
 *
 * These tests call the service directly, with the schema out of the way, so the
 * second layer is independently proven. Defence in depth is only depth if each
 * layer is actually verified.
 */

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();
}, 60_000);

afterAll(async () => {
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
});

describe("assertSelfAssignable, reached directly", () => {
  it("refuses to create an admin even when the schema is bypassed", async () => {
    await expect(
      // Cast because the type says this is impossible — which is the point.
      // A future caller that skips validation, or a schema relaxed for a
      // client-side reason, must still be refused here.
      createUser("uid-attacker", { role: "admin" } as unknown as { role: "business" }),
    ).rejects.toThrow(/cannot assign yourself that role/i);

    expect(await UserModel.countDocuments()).toBe(0);
  });

  it("refuses to promote to admin even when the schema is bypassed", async () => {
    await UserModel.create({ authUid: "uid-victim", role: "business", blocked: false });

    await expect(
      updateOwnUser("uid-victim", { role: "admin" } as unknown as { role: "business" }),
    ).rejects.toThrow(/cannot assign yourself that role/i);

    expect((await UserModel.findOne({ authUid: "uid-victim" }))?.role).toBe("business");
  });

  it("still allows the two legitimate roles", async () => {
    await expect(createUser("uid-a", { role: "business" })).resolves.toMatchObject({
      role: "business",
    });
    await expect(createUser("uid-b", { role: "accountant" })).resolves.toMatchObject({
      role: "accountant",
    });
  });
});
