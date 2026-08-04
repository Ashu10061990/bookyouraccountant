import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCipher } from "../helpers/crypto.helper.js";
import { assertIndexes } from "../config/db.js";
import { localKms } from "../integrations/kms.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";
import * as repository from "../repositories/accountants.repository.js";
import { readKycPlaintext } from "./accountants.service.js";
import type { RequestContext } from "../middlewares/auth.middleware.js";

/**
 * Service-layer tests reached WITHOUT the route.
 *
 * readKycPlaintext sits behind requireRole("admin") at the route, so the route
 * rejects a non-admin before the service's own role check runs — which makes
 * that check invisible to the integration tests and lets it be deleted while
 * they stay green (found by mutation testing).
 *
 * The service check is not redundant. It is what makes the decrypt-and-audit
 * path safe for a future caller that reaches it another way — the payout job,
 * an internal admin tool — rather than trusting that every such caller
 * remembers to gate itself. Defence in depth is only depth if each layer is
 * verified on its own.
 */

const cipher = createCipher(localKms(randomBytes(32)));

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
    authUid: "acc-1",
    name: "Asha",
    city: "Kochi",
    state: "Kerala",
    qualifications: ["ca"],
    experienceYears: 10,
    specialties: ["gst"],
    languages: ["english"],
    accountingSoftware: [],
    complianceSoftware: [],
  });
});

const ctx = (role: RequestContext["role"], uid = "someone"): RequestContext => ({
  uid,
  role,
  blocked: false,
});

describe("readKycPlaintext enforces admin at the service layer", () => {
  it.each(["business", "accountant"] as const)(
    "refuses a %s even reached directly",
    async (role) => {
      await expect(readKycPlaintext(ctx(role), "acc-1", cipher)).rejects.toThrow(/administrator/i);
    },
  );

  // The owner reaching it directly must still be refused — decryption is an
  // administrative act, not an owner capability.
  it("refuses the accountant reading their own, reached directly", async () => {
    await expect(readKycPlaintext(ctx("accountant", "acc-1"), "acc-1", cipher)).rejects.toThrow(
      /administrator/i,
    );
  });
});
