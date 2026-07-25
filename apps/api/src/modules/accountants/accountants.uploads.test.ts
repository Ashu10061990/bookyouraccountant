import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../../platform/db.js";
import type { StoragePort } from "../../platform/storage.js";
import { TOKENS, UIDS, as, buildTestApp } from "../../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../../test/mongo.js";
import { UserModel } from "../users/users.schema.js";

/**
 * Task S4 of `docs/specs/2026-07-25-s3-storage-slice.md` — an accountant
 * attaches profile photo/marksheet object keys, prefix-guarded to their own
 * uid, and reads the photo back via a presigned download URL.
 *
 * A `StoragePort` that never touches AWS: `presignDownload` answers with a
 * canned URL derived from the key it was given, so a test can assert the
 * response actually carries a URL for the RIGHT key — not just any URL —
 * without a real S3 bucket. `presignUpload`/`remove` are unused by this
 * module's routes but implemented so the fake satisfies the full port.
 */
function fakeStorage(): StoragePort {
  return {
    presignUpload(input) {
      return Promise.resolve({
        key: input.key,
        uploadUrl: `https://fake-bucket.test/${input.key}`,
        expiresInSeconds: 300,
      });
    },
    presignDownload(key) {
      return Promise.resolve(`https://fake-bucket.test/download/${key}`);
    },
    remove() {
      return Promise.resolve();
    },
  };
}

let app: FastifyInstance;

const PROFILE = {
  name: "Asha Menon",
  city: "Kochi",
  state: "Kerala",
  qualifications: ["ca"],
  experienceYears: 12,
  specialties: ["bookkeeping"],
  languages: ["english"],
};

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();
  app = await buildTestApp({}, undefined, undefined, fakeStorage());
}, 60_000);

afterAll(async () => {
  await app.close();
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
  await UserModel.create([
    { firebaseUid: UIDS.accountant, role: "accountant", blocked: false },
    { firebaseUid: UIDS.other, role: "accountant", blocked: false },
  ]);

  const created = await app.inject({
    method: "POST",
    url: "/v1/accountants",
    headers: as(TOKENS.accountant),
    payload: PROFILE,
  });
  expect(created.statusCode).toBe(201);
});

describe("PATCH /v1/accountants/me — photoKey/marksheetKeys", () => {
  it("lets the owner set a photoKey under their own uid", async () => {
    const key = `photos/${UIDS.accountant}/portrait.jpg`;

    const res = await app.inject({
      method: "PATCH",
      url: "/v1/accountants/me",
      headers: as(TOKENS.accountant),
      payload: { photoKey: key },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ accountant: { photoKey: key } });
  });

  it("lets the owner set marksheetKeys under their own uid", async () => {
    const keys = [
      `marksheets/${UIDS.accountant}/degree.pdf`,
      `marksheets/${UIDS.accountant}/inter.pdf`,
    ];

    const res = await app.inject({
      method: "PATCH",
      url: "/v1/accountants/me",
      headers: as(TOKENS.accountant),
      payload: { marksheetKeys: keys },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ accountant: { marksheetKeys: keys } });
  });

  /**
   * The denial this slice exists to prove: a caller cannot claim another
   * uid's object merely by naming its key in the PATCH body. This is the
   * security core — `assertOwnedKeys` — not a side effect of validation.
   */
  it("refuses a photoKey outside the caller's own uid prefix, and stores nothing", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/accountants/me",
      headers: as(TOKENS.accountant),
      payload: { photoKey: `photos/${UIDS.other}/portrait.jpg` },
    });

    expect(res.statusCode).toBe(403);

    const stored = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}`,
      headers: as(TOKENS.accountant),
    });
    expect(
      stored.json<{ accountant: { photoKey?: string } }>().accountant.photoKey,
    ).toBeUndefined();
  });

  it("refuses a marksheetKeys entry outside the caller's own uid prefix, and stores nothing", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/accountants/me",
      headers: as(TOKENS.accountant),
      payload: {
        marksheetKeys: [
          `marksheets/${UIDS.accountant}/degree.pdf`,
          `marksheets/${UIDS.other}/inter.pdf`,
        ],
      },
    });

    expect(res.statusCode).toBe(403);

    const stored = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}`,
      headers: as(TOKENS.accountant),
    });
    expect(
      stored.json<{ accountant: { marksheetKeys?: string[] } }>().accountant.marksheetKeys,
    ).toBeUndefined();
  });
});

describe("GET /v1/accountants/me/uploads/photo", () => {
  it("mints a presigned URL for the owner's stored photo", async () => {
    const key = `photos/${UIDS.accountant}/portrait.jpg`;
    await app.inject({
      method: "PATCH",
      url: "/v1/accountants/me",
      headers: as(TOKENS.accountant),
      payload: { photoKey: key },
    });

    const res = await app.inject({
      method: "GET",
      url: "/v1/accountants/me/uploads/photo",
      headers: as(TOKENS.accountant),
    });

    expect(res.statusCode).toBe(200);
    // Not just "some URL": the fake echoes the key back, so this proves the
    // route passed the OWNER'S actual stored key to `presignDownload`.
    expect(res.json()).toEqual({ url: `https://fake-bucket.test/download/${key}` });
  });

  it("404s when the caller has no photo on file", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/accountants/me/uploads/photo",
      headers: as(TOKENS.accountant),
    });

    expect(res.statusCode).toBe(404);
  });

  it("rejects an unauthenticated caller", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/accountants/me/uploads/photo" });
    expect(res.statusCode).toBe(401);
  });
});

describe("photoKey/marksheetKeys visibility by view", () => {
  it("appears in the owner's private view but never in the public view", async () => {
    const photoKey = `photos/${UIDS.accountant}/portrait.jpg`;
    const marksheetKeys = [`marksheets/${UIDS.accountant}/degree.pdf`];

    const patched = await app.inject({
      method: "PATCH",
      url: "/v1/accountants/me",
      headers: as(TOKENS.accountant),
      payload: { photoKey, marksheetKeys },
    });
    expect(patched.statusCode).toBe(200);

    const owner = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}`,
      headers: as(TOKENS.accountant),
    });
    expect(owner.json()).toMatchObject({ accountant: { photoKey, marksheetKeys } });

    // The public view — unauthenticated, exactly the marketplace showcase
    // path — must not carry the raw keys at all, not even under a different
    // shape. `toContain` on the raw payload guards against the key leaking
    // anywhere in the response, not just under the expected property name.
    const anonymous = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}`,
    });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.payload).not.toContain(photoKey);
    expect(anonymous.payload).not.toContain("marksheets/");
    expect(anonymous.json<{ accountant: object }>().accountant).not.toHaveProperty("photoKey");
    expect(anonymous.json<{ accountant: object }>().accountant).not.toHaveProperty("marksheetKeys");
  });
});
