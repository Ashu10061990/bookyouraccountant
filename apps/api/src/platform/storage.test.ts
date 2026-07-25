import { ERROR_CODES } from "@bya/shared";
import { describe, expect, it } from "vitest";
import { AppError } from "./errors.js";
import { buildOwnedKey, maxBytesForScope, STORAGE_SCOPES, unavailableStorage } from "./storage.js";

/** RFC 4122 v4, lowercase — exactly what `node:crypto`'s `randomUUID()` emits. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Runs `fn`, asserts it threw the `badRequest` shape `buildOwnedKey` promises
 * for every rejected filename: an `AppError` with status 400, the shared
 * `BAD_REQUEST` code, and the exact "Invalid file name." message. Centralised
 * so each denial test is one line, and so the assertion itself can't silently
 * pass on a filename that didn't throw at all.
 */
function expectInvalidFilename(fn: () => unknown): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }

  if (!(caught instanceof AppError)) {
    throw new Error(`expected buildOwnedKey to throw an AppError, got: ${String(caught)}`);
  }

  expect(caught.status).toBe(400);
  expect(caught.code).toBe(ERROR_CODES.BAD_REQUEST);
  expect(caught.message).toBe("Invalid file name.");
}

describe("STORAGE_SCOPES", () => {
  it("ports exactly the legacy six Cloud Storage paths with their size caps", () => {
    expect(STORAGE_SCOPES).toEqual({
      resumes: 5,
      marksheets: 5,
      kyc: 5,
      photos: 5,
      mis: 10,
      clientUploads: 10,
    });
  });
});

describe("maxBytesForScope", () => {
  it("maps a 5 MB scope to bytes", () => {
    expect(maxBytesForScope("photos")).toBe(5 * 1024 * 1024);
    expect(maxBytesForScope("resumes")).toBe(5 * 1024 * 1024);
    expect(maxBytesForScope("marksheets")).toBe(5 * 1024 * 1024);
    expect(maxBytesForScope("kyc")).toBe(5 * 1024 * 1024);
  });

  it("maps a 10 MB scope to bytes", () => {
    expect(maxBytesForScope("mis")).toBe(10 * 1024 * 1024);
    expect(maxBytesForScope("clientUploads")).toBe(10 * 1024 * 1024);
  });
});

describe("buildOwnedKey", () => {
  it("produces <scope>/<uid>/<uuid>.<ext>", () => {
    const key = buildOwnedKey("photos", "uid-123", "photo.jpg");
    const match = /^photos\/uid-123\/([0-9a-f-]+)\.jpg$/.exec(key);

    expect(match).not.toBeNull();
    expect(match?.[1]).toMatch(UUID_V4);
  });

  it("is always uid-prefixed under the given scope, whichever scope is used", () => {
    expect(buildOwnedKey("marksheets", "uid-abc", "sheet.pdf")).toMatch(/^marksheets\/uid-abc\//);
    expect(buildOwnedKey("mis", "uid-xyz", "report.xlsx")).toMatch(/^mis\/uid-xyz\//);
    expect(buildOwnedKey("clientUploads", "uid-1", "doc.pdf")).toMatch(/^clientUploads\/uid-1\//);
  });

  it("derives the extension from the filename, lowercased", () => {
    expect(buildOwnedKey("photos", "uid", "IMAGE.JPG")).toMatch(/\.jpg$/);
    expect(buildOwnedKey("marksheets", "uid", "cert.PDF")).toMatch(/\.pdf$/);
  });

  it("keeps only the final extension of a multi-dot filename", () => {
    expect(buildOwnedKey("mis", "uid", "archive.tar.gz")).toMatch(/\.gz$/);
  });

  it("allows a filename with no extension — the key just carries none", () => {
    const key = buildOwnedKey("kyc", "uid", "noextension");
    expect(key).toMatch(/^kyc\/uid\/[0-9a-f-]{36}$/);
  });

  it("treats a bare dotfile-style name as having no extension", () => {
    // node:path's extname(".jpg") is "" — a single leading dot with nothing
    // before it is a hidden-file name, not a basename+extension. buildOwnedKey
    // inherits that: the key gets no extension rather than ".jpg".
    const key = buildOwnedKey("photos", "uid", ".jpg");
    expect(key).toMatch(/^photos\/uid\/[0-9a-f-]{36}$/);
  });

  it("generates a fresh UUID every call, so the client filename never determines the object name", () => {
    const first = buildOwnedKey("photos", "uid-1", "same-name.jpg");
    const second = buildOwnedKey("photos", "uid-1", "same-name.jpg");

    expect(first).not.toBe(second);
  });

  it("rejects a filename containing a forward slash", () => {
    expectInvalidFilename(() => buildOwnedKey("photos", "uid", "sub/photo.jpg"));
  });

  it("rejects a filename containing a backslash", () => {
    expectInvalidFilename(() => buildOwnedKey("photos", "uid", "sub\\photo.jpg"));
  });

  it("rejects a filename containing a path-traversal segment", () => {
    expectInvalidFilename(() => buildOwnedKey("photos", "uid", "../../etc/passwd"));
    expectInvalidFilename(() => buildOwnedKey("photos", "uid", "..jpg"));
  });

  it("rejects an oversized extension", () => {
    expectInvalidFilename(() => buildOwnedKey("photos", "uid", "file.123456789"));
  });

  it("rejects an extension with characters outside [a-z0-9]", () => {
    expectInvalidFilename(() => buildOwnedKey("photos", "uid", "file.j$g"));
  });

  it("rejects a bare trailing dot with nothing after it", () => {
    expectInvalidFilename(() => buildOwnedKey("photos", "uid", "file."));
  });
});

describe("unavailableStorage", () => {
  it("presignUpload rejects with a 503 AppError", async () => {
    const storage = unavailableStorage();

    await expect(async () =>
      storage.presignUpload({ key: "photos/uid/x.jpg", contentType: "image/jpeg", maxBytes: 1 }),
    ).rejects.toMatchObject({
      status: 503,
      code: ERROR_CODES.INTERNAL,
      message: "File storage is not configured on this server.",
    });
  });

  it("presignDownload rejects with a 503 AppError", async () => {
    const storage = unavailableStorage();

    await expect(async () => storage.presignDownload("photos/uid/x.jpg")).rejects.toMatchObject({
      status: 503,
      code: ERROR_CODES.INTERNAL,
      message: "File storage is not configured on this server.",
    });
  });

  it("remove rejects with a 503 AppError", async () => {
    const storage = unavailableStorage();

    await expect(async () => storage.remove("photos/uid/x.jpg")).rejects.toMatchObject({
      status: 503,
      code: ERROR_CODES.INTERNAL,
      message: "File storage is not configured on this server.",
    });
  });
});
