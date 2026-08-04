import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../config/db.js";
import type { StoragePort, UploadTarget } from "../integrations/storage.js";
import { UserModel } from "../models/user.model.js";
import { TOKENS, UIDS, as, buildTestApp } from "../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";

/** What `StoragePort.presignUpload` actually received, for one call. */
type RecordedPresign = Parameters<StoragePort["presignUpload"]>[0];

/**
 * A `StoragePort` that never touches AWS: it records every `presignUpload`
 * input — so a test can assert the KEY THE SERVICE ACTUALLY BUILT, not just
 * what the route returned — and answers with a canned `UploadTarget`.
 * `presignDownload`/`remove` are unused by this endpoint but implemented so
 * the fake satisfies the full port.
 */
function fakeStorage(): { storage: StoragePort; calls: RecordedPresign[] } {
  const calls: RecordedPresign[] = [];

  const storage: StoragePort = {
    presignUpload(input): Promise<UploadTarget> {
      calls.push(input);
      return Promise.resolve({
        key: input.key,
        uploadUrl: `https://fake-bucket.test/${input.key}`,
        expiresInSeconds: 300,
      });
    },
    presignDownload(): Promise<string> {
      return Promise.resolve("https://fake-bucket.test/download");
    },
    remove(): Promise<void> {
      return Promise.resolve();
    },
  };

  return { storage, calls };
}

let app: FastifyInstance;
let calls: RecordedPresign[];

const presignPayload = { scope: "photos", filename: "me.jpg", contentType: "image/jpeg" };

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();
  const fake = fakeStorage();
  calls = fake.calls;
  app = await buildTestApp({}, undefined, undefined, fake.storage);
}, 60_000);

afterAll(async () => {
  await app.close();
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
  calls.length = 0;
  await UserModel.create([
    { authUid: UIDS.accountant, role: "accountant", blocked: false },
    { authUid: UIDS.other, role: "accountant", blocked: false },
  ]);
});

describe("POST /v1/uploads/presign", () => {
  it("mints an owner-scoped presigned URL for an authenticated caller", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/uploads/presign",
      headers: as(TOKENS.accountant),
      payload: presignPayload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ key: string; uploadUrl: string; expiresInSeconds: number }>();
    expect(body.key.startsWith(`photos/${UIDS.accountant}/`)).toBe(true);
    expect(body.uploadUrl).toBeTruthy();
    expect(body.expiresInSeconds).toBe(300);

    // Assert what the SERVICE actually handed the storage port, not just what
    // the route echoed back — the two happen to match here because the fake
    // returns `input.key` verbatim, but this is the property under test.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.key.startsWith(`photos/${UIDS.accountant}/`)).toBe(true);
    expect(calls[0]?.contentType).toBe("image/jpeg");
    expect(calls[0]?.maxBytes).toBe(5 * 1024 * 1024);
  });

  /**
   * The denial. `presignRequestSchema` has no `uid`/`key` field for a client
   * to propose — a caller can only ever send `scope`/`filename`/`contentType`
   * — so there is nothing in the body to attack. This proves the negative
   * directly: the exact same body from two different callers lands under two
   * different uid prefixes, and the second caller's key is never, in any
   * form, reachable under the first caller's uid.
   */
  it("scopes the key to the caller's own uid — never another's, whatever the body says", async () => {
    const accountantRes = await app.inject({
      method: "POST",
      url: "/v1/uploads/presign",
      headers: as(TOKENS.accountant),
      payload: presignPayload,
    });
    const otherRes = await app.inject({
      method: "POST",
      url: "/v1/uploads/presign",
      headers: as(TOKENS.other),
      payload: presignPayload,
    });

    expect(accountantRes.statusCode).toBe(200);
    expect(otherRes.statusCode).toBe(200);

    const otherKey = otherRes.json<{ key: string }>().key;

    expect(otherKey.startsWith(`photos/${UIDS.other}/`)).toBe(true);
    expect(otherKey.startsWith(`photos/${UIDS.accountant}/`)).toBe(false);

    // And the fake storage port — the thing that would actually write to
    // S3 — received exactly that same owner-scoped key, not something a
    // handler-level check papered over.
    expect(calls).toHaveLength(2);
    expect(calls[0]?.key.startsWith(`photos/${UIDS.accountant}/`)).toBe(true);
    expect(calls[1]?.key.startsWith(`photos/${UIDS.other}/`)).toBe(true);
  });

  it("rejects an unknown scope with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/uploads/presign",
      headers: as(TOKENS.accountant),
      payload: { ...presignPayload, scope: "hacker" },
    });

    expect(res.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("rejects an unauthenticated caller with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/uploads/presign",
      payload: presignPayload,
    });

    expect(res.statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("rejects a path-traversal filename with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/uploads/presign",
      headers: as(TOKENS.accountant),
      payload: { ...presignPayload, filename: "../../etc/passwd" },
    });

    expect(res.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
