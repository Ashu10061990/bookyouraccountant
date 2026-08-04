import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../config/db.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";
import * as repository from "../repositories/audit.repository.js";
import { startDbSession } from "../repositories/transactions.repository.js";
import { AUDIT_ACTIONS, record, withAudit } from "./audit.service.js";
import { AuditModel } from "../models/audit.model.js";
import { ServiceModel } from "../models/service.model.js";

const ADMIN = { uid: "uid-admin", role: "admin" } as const;

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

describe("append-only by construction", () => {
  // Spec §6.7: "No update or delete path exists in code."
  //
  // A Mongoose schema cannot enforce this — anything holding the model can call
  // updateOne. The guarantee is that no caller *can* be written without adding
  // a function to the repository, which a reviewer would see. This test is what
  // makes adding one break the build rather than pass silently.
  it("the repository exports no update or delete function", () => {
    const exported = Object.keys(repository).sort();

    expect(exported).toEqual(["append", "count", "findByActor", "findBySubject"]);

    for (const name of exported) {
      expect(name).not.toMatch(/update|delete|remove|drop|set/i);
    }
  });

  it("records the actor, the subject and the action", async () => {
    await record({
      action: AUDIT_ACTIONS.KYC_READ,
      actor: ADMIN,
      subjectType: "accountant",
      subjectId: "acc-1",
    });

    const [entry] = await repository.findBySubject("accountant", "acc-1");
    expect(entry).toMatchObject({
      action: "kyc.read",
      actorUid: "uid-admin",
      actorRole: "admin",
      subjectType: "accountant",
      subjectId: "acc-1",
    });
    expect(entry?.at).toBeInstanceOf(Date);
  });

  it("returns a subject's history newest first", async () => {
    await record({
      action: AUDIT_ACTIONS.KYC_READ,
      actor: ADMIN,
      subjectType: "accountant",
      subjectId: "acc-1",
    });
    await record({
      action: AUDIT_ACTIONS.ACCOUNTANT_VERIFY,
      actor: ADMIN,
      subjectType: "accountant",
      subjectId: "acc-1",
    });

    const history = await repository.findBySubject("accountant", "acc-1");
    expect(history).toHaveLength(2);
    expect(history[0]?.action).toBe("accountant.verify");
  });

  it("keeps one subject's history out of another's", async () => {
    await record({
      action: AUDIT_ACTIONS.KYC_READ,
      actor: ADMIN,
      subjectType: "accountant",
      subjectId: "acc-1",
    });

    expect(await repository.findBySubject("accountant", "acc-2")).toHaveLength(0);
  });
});

describe("withAudit — the action and its record commit together", () => {
  // The property §6.7 actually asks for. Without a shared transaction, a crash
  // between the two leaves either an unrecorded admin override or a record of
  // something that never happened. For statutory records both are wrong.
  it("commits the change and the audit entry together", async () => {
    await withAudit(
      { action: AUDIT_ACTIONS.SERVICE_CREATE, actor: ADMIN, subjectType: "service" },
      async (session) => {
        await ServiceModel.create([{ id: "audited", name: "Audited", active: true }], { session });
        return { result: "ok", subjectId: "audited" };
      },
    );

    expect(await ServiceModel.countDocuments({ id: "audited" })).toBe(1);
    expect(await repository.findBySubject("service", "audited")).toHaveLength(1);
  });

  // The half that a non-transactional implementation gets wrong. If `work`
  // fails after writing, the write must not survive — and neither must an
  // audit entry claiming it happened.
  it("rolls the change back when the work throws, leaving no audit entry", async () => {
    await expect(
      withAudit(
        { action: AUDIT_ACTIONS.SERVICE_CREATE, actor: ADMIN, subjectType: "service" },
        async (session) => {
          await ServiceModel.create([{ id: "doomed", name: "Doomed", active: true }], { session });
          throw new Error("precondition failed after the write");
        },
      ),
    ).rejects.toThrow(/precondition failed/);

    expect(await ServiceModel.countDocuments({ id: "doomed" })).toBe(0);
    expect(await repository.count()).toBe(0);
  });

  // The mirror case: if the audit write fails, the action must not stand.
  // An unrecorded admin override is exactly what §6.7 exists to prevent.
  it("rolls the change back when the audit entry cannot be written", async () => {
    await expect(
      withAudit(
        // actorRole is enum-validated, so this audit insert fails validation.
        {
          action: AUDIT_ACTIONS.SERVICE_CREATE,
          actor: { uid: "uid-x", role: "not-a-role" as unknown as "admin" },
          subjectType: "service",
        },
        async (session) => {
          await ServiceModel.create([{ id: "orphan", name: "Orphan", active: true }], { session });
          return { result: "ok", subjectId: "orphan" };
        },
      ),
    ).rejects.toThrow();

    expect(await ServiceModel.countDocuments({ id: "orphan" })).toBe(0);
  });

  it("returns the work's result to the caller", async () => {
    const result = await withAudit(
      { action: AUDIT_ACTIONS.SERVICE_CREATE, actor: ADMIN, subjectType: "service" },
      (session) =>
        ServiceModel.create([{ id: "returned", name: "R", active: true }], { session }).then(
          () => ({
            result: { id: "returned" },
            subjectId: "returned",
          }),
        ),
    );

    expect(result).toEqual({ id: "returned" });
  });
});

describe("what the log must never contain", () => {
  // The point of auditing KYC access is the *fact* of the access. Storing the
  // PAN alongside would turn the audit log into a second, longer-lived copy of
  // exactly the data it is meant to protect — one that survives account
  // deletion by design.
  it("records that KYC was read without recording what was read", async () => {
    await record({
      action: AUDIT_ACTIONS.KYC_READ,
      actor: ADMIN,
      subjectType: "accountant",
      subjectId: "acc-1",
      metadata: { fields: ["pan"], reason: "verification" },
    });

    const serialised = JSON.stringify(await AuditModel.find().lean());
    expect(serialised).toContain("kyc.read");
    expect(serialised).toContain("pan");
    // The field *name* is fine; a PAN-shaped value is not.
    expect(serialised).not.toMatch(/[A-Z]{5}\d{4}[A-Z]/);
  });
});

describe("indexes", () => {
  it("indexes the subject lookup an investigation starts from", async () => {
    const indexes = (await AuditModel.collection.indexes()) as { key: Record<string, number> }[];

    const compound = indexes.find(
      (index) =>
        index.key["subjectType"] !== undefined &&
        index.key["subjectId"] !== undefined &&
        index.key["at"] !== undefined,
    );

    expect(compound).toBeDefined();
  });

  it("has no unique index — an audit log must accept identical events", async () => {
    // The same admin reading the same PAN twice is two events, not a conflict.
    const indexes = (await AuditModel.collection.indexes()) as { unique?: boolean }[];
    expect(indexes.some((index) => index.unique === true)).toBe(false);

    await record({
      action: AUDIT_ACTIONS.KYC_READ,
      actor: ADMIN,
      subjectType: "accountant",
      subjectId: "acc-1",
    });
    await record({
      action: AUDIT_ACTIONS.KYC_READ,
      actor: ADMIN,
      subjectType: "accountant",
      subjectId: "acc-1",
    });

    expect(await repository.count()).toBe(2);
  });
});

describe("transaction support is real", () => {
  // If the test topology were a standalone mongod, every transactional test
  // above would fail with "Transaction numbers are only allowed on a replica
  // set member or mongos". Asserting the topology here means that failure
  // arrives as one clear message rather than five confusing ones.
  it("runs against a replica set, as Atlas does", async () => {
    const session = await startDbSession();

    try {
      // A write inside a committed transaction, then read back outside it.
      // Asserting only that withTransaction resolves proves nothing — it
      // resolves to undefined either way.
      await session.withTransaction(async () => {
        await AuditModel.create(
          [
            {
              action: "kyc.read",
              actorUid: "uid-admin",
              actorRole: "admin",
              subjectType: "topology",
              subjectId: "probe",
              at: new Date(),
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    expect(await repository.findBySubject("topology", "probe")).toHaveLength(1);
  });

  it("aborts leave nothing behind", async () => {
    const session = await startDbSession();

    try {
      await expect(
        session.withTransaction(async () => {
          await AuditModel.create(
            [
              {
                action: "kyc.read",
                actorUid: "uid-admin",
                actorRole: "admin",
                subjectType: "topology",
                subjectId: "aborted",
                at: new Date(),
              },
            ],
            { session },
          );
          throw new Error("abort");
        }),
      ).rejects.toThrow(/abort/);
    } finally {
      await session.endSession();
    }

    expect(await repository.findBySubject("topology", "aborted")).toHaveLength(0);
  });
});
