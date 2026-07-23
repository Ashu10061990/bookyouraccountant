import { describe, expect, it } from "vitest";
import {
  CONFIG_DOCS,
  CONFIG_SCHEMAS,
  complianceOverridesSchema,
  platformFeesSchema,
} from "./config.js";
import { leadUpsertSchema } from "./lead.js";
import { createServiceSchema } from "./service.js";
import { SELF_ASSIGNABLE_ROLES, USER_ROLES, createUserSchema, updateUserSchema } from "./user.js";

describe("user roles", () => {
  it("recognises three roles", () => {
    expect(USER_ROLES).toEqual(["business", "accountant", "admin"]);
  });

  // The single most important assertion in this file. In the legacy system the
  // only thing standing between a signed-in user and an admin role was a
  // firestore.rules clause. Moving to a Node API deletes that layer, so the
  // restriction lives here — and this test is what proves it still exists.
  it("does not let a user assign themselves the admin role", () => {
    expect(SELF_ASSIGNABLE_ROLES).not.toContain("admin");
    expect(createUserSchema.safeParse({ role: "admin" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ role: "admin" }).success).toBe(false);
  });

  it("accepts the two self-assignable roles", () => {
    expect(createUserSchema.safeParse({ role: "business" }).success).toBe(true);
    expect(createUserSchema.safeParse({ role: "accountant" }).success).toBe(true);
  });

  it("rejects a role that is not a role at all", () => {
    expect(createUserSchema.safeParse({ role: "superuser" }).success).toBe(false);
    expect(createUserSchema.safeParse({}).success).toBe(false);
  });
});

describe("createUserSchema", () => {
  // Identity comes from the verified token. If the schema kept a client-sent
  // firebaseUid, a service could one day read it by mistake and hand one user
  // another user's document.
  it("strips fields the client has no business setting", () => {
    const parsed = createUserSchema.parse({
      role: "business",
      firebaseUid: "someone-elses-uid",
      blocked: false,
      legacyId: "forged",
    });

    expect(parsed).toEqual({ role: "business" });
    expect(parsed).not.toHaveProperty("firebaseUid");
    expect(parsed).not.toHaveProperty("blocked");
  });

  it("validates phone as E.164", () => {
    expect(createUserSchema.safeParse({ role: "business", phone: "+919876543210" }).success).toBe(
      true,
    );
    expect(createUserSchema.safeParse({ role: "business", phone: "9876543210" }).success).toBe(
      false,
    );
    expect(createUserSchema.safeParse({ role: "business", phone: "not a phone" }).success).toBe(
      false,
    );
  });

  it("validates email", () => {
    expect(createUserSchema.safeParse({ role: "business", email: "a@b.com" }).success).toBe(true);
    expect(createUserSchema.safeParse({ role: "business", email: "nope" }).success).toBe(false);
  });
});

describe("leadUpsertSchema", () => {
  it("defaults mode and completed", () => {
    expect(leadUpsertSchema.parse({})).toEqual({ mode: "register", completed: false });
  });

  // At OTP time the user may not have picked a side yet. The legacy code wrote
  // an empty string; optional models the same fact without a sentinel.
  it("allows a lead with no role yet", () => {
    expect(leadUpsertSchema.safeParse({ role: undefined }).success).toBe(true);
  });

  it("rejects admin as a lead role", () => {
    expect(leadUpsertSchema.safeParse({ role: "admin" }).success).toBe(false);
  });

  it("strips a client-sent firebaseUid", () => {
    expect(leadUpsertSchema.parse({ firebaseUid: "someone-else" })).not.toHaveProperty(
      "firebaseUid",
    );
  });
});

describe("createServiceSchema", () => {
  it("accepts a lowercase slug id and defaults active to true", () => {
    expect(createServiceSchema.parse({ id: "bookkeeping", name: "Bookkeeping" })).toEqual({
      id: "bookkeeping",
      name: "Bookkeeping",
      active: true,
    });
  });

  it("rejects ids that would not survive a URL or a migration", () => {
    for (const id of ["Bookkeeping", "book keeping", "book-keeping", "1book", ""]) {
      expect(createServiceSchema.safeParse({ id, name: "x" }).success).toBe(false);
    }
  });
});

describe("platformFeesSchema", () => {
  const VALID = {
    takeRate: 0.12,
    gstOnFeeRate: 0.18,
    tdsRate: 0.001,
    gstTcsRate: 0.005,
    minFeePaise: 20_000,
    tdsThresholdPaise: 50_000_000,
  };

  it("accepts the current statutory values", () => {
    expect(platformFeesSchema.safeParse(VALID).success).toBe(true);
  });

  // A rate above 1 is a percentage entered where a proportion was expected —
  // 12 instead of 0.12. Unchecked, that charges a hundred times the intended
  // fee on real money.
  it("rejects a rate above 1", () => {
    expect(platformFeesSchema.safeParse({ ...VALID, takeRate: 12 }).success).toBe(false);
  });

  it("rejects a negative rate", () => {
    expect(platformFeesSchema.safeParse({ ...VALID, tdsRate: -0.1 }).success).toBe(false);
  });

  it("requires paise amounts to be integers", () => {
    expect(platformFeesSchema.safeParse({ ...VALID, minFeePaise: 200.5 }).success).toBe(false);
  });
});

describe("complianceOverridesSchema", () => {
  it("accepts an extension list and a verification date", () => {
    const parsed = complianceOverridesSchema.parse({
      extensions: [{ match: "GSTR-3B", from: "2026-07-20", to: "2026-07-27", note: "CBIC" }],
      verifiedOn: "2026-07-23",
    });

    expect(parsed.extensions).toHaveLength(1);
    expect(parsed.extensions[0]?.to).toBe("2026-07-27");
  });

  it("defaults to no extensions", () => {
    expect(complianceOverridesSchema.parse({ verifiedOn: "2026-07-23" }).extensions).toEqual([]);
  });

  it("rejects a non-ISO date", () => {
    expect(complianceOverridesSchema.safeParse({ verifiedOn: "23/07/2026" }).success).toBe(false);
  });
});

describe("CONFIG_SCHEMAS", () => {
  it("covers every config document", () => {
    expect(Object.keys(CONFIG_SCHEMAS).sort()).toEqual([...CONFIG_DOCS].sort());
  });

  // The two documents have completely different shapes. Validating one against
  // the other's schema would let an admin overwrite the payout rates with a
  // compliance calendar — and the payout engine would read the result as zeros.
  it("does not accept one document's body for the other", () => {
    const fees = {
      takeRate: 0.12,
      gstOnFeeRate: 0.18,
      tdsRate: 0.001,
      gstTcsRate: 0.005,
      minFeePaise: 20_000,
      tdsThresholdPaise: 50_000_000,
    };

    expect(CONFIG_SCHEMAS.complianceOverrides.safeParse(fees).success).toBe(false);
    expect(CONFIG_SCHEMAS.platformFees.safeParse({ verifiedOn: "2026-07-23" }).success).toBe(false);
  });
});
