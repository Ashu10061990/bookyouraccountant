import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../config/db.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";
import * as repository from "../repositories/businesses.repository.js";
import { getForViewer } from "./businesses.service.js";
import type { RequestContext } from "../middlewares/auth.middleware.js";

/**
 * getForViewer's ownership check is the only thing standing between one
 * business and another's profile — the route uses plain requireAuth, not a
 * role guard, so nothing upstream enforces it. Reached directly here so the
 * check is verified rather than assumed.
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
  await repository.insert({
    authUid: "biz-1",
    fullName: "Ramesh",
    signatoryRole: "proprietor",
    orgName: "Iyer Traders",
    orgType: "proprietorship",
    address: { line: "12 MG Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
  });
});

const ctx = (uid: string, role: RequestContext["role"]): RequestContext => ({
  uid,
  role,
  blocked: false,
});

describe("getForViewer enforces ownership at the service layer", () => {
  it("lets the owner read their own", async () => {
    await expect(getForViewer(ctx("biz-1", "business"), "biz-1")).resolves.toMatchObject({
      orgName: "Iyer Traders",
    });
  });

  it("lets an admin read any", async () => {
    await expect(getForViewer(ctx("admin-1", "admin"), "biz-1")).resolves.toBeDefined();
  });

  it("refuses another business reached directly", async () => {
    await expect(getForViewer(ctx("biz-2", "business"), "biz-1")).rejects.toThrow(/access/i);
  });

  it("refuses an accountant reached directly", async () => {
    await expect(getForViewer(ctx("acc-1", "accountant"), "biz-1")).rejects.toThrow(/access/i);
  });
});
