import { describe, expect, it } from "vitest";
import { s3Storage } from "./storage.js";

/**
 * `getSignedUrl` (from `@aws-sdk/s3-request-presigner`) computes a SigV4
 * signature over the request locally — it never calls AWS. That makes the
 * adapter fully testable offline: dummy credentials sign a syntactically
 * real presigned URL, with no network access and no real bucket.
 *
 * These tests assert the URL's *shape* (bucket, key, and the SigV4 query
 * params that prove a signature was actually computed), not connectivity. A
 * real byte round-trip needs LocalStack or AWS — see the spec's task 6.
 */
function testConfig(): Parameters<typeof s3Storage>[0] {
  return {
    region: "ap-south-1",
    bucket: "test-bucket",
    endpoint: "http://127.0.0.1:4566",
    accessKeyId: "dummy",
    secretAccessKey: "dummy",
  };
}

describe("s3Storage", () => {
  describe("presignUpload", () => {
    it("returns an upload target whose URL carries the bucket, key, and a real SigV4 signature", async () => {
      const storage = s3Storage(testConfig());
      const key = "photos/u1/abc.jpg";

      const target = await storage.presignUpload({
        key,
        contentType: "image/jpeg",
        maxBytes: 5 * 1024 * 1024,
      });

      expect(target.key).toBe(key);
      expect(target.expiresInSeconds).toBe(300);
      expect(target.uploadUrl).toContain("test-bucket");
      expect(target.uploadUrl).toContain(key);
      expect(target.uploadUrl).toContain("X-Amz-Signature");
      // Locks the 300s expiry into the signed URL itself, not just the
      // returned field — the two must agree, or a client trusting
      // `expiresInSeconds` would be wrong about when the URL actually dies.
      expect(target.uploadUrl).toContain("X-Amz-Expires=300");
    });

    it("path-styles the URL under a custom endpoint (LocalStack/MinIO), per forcePathStyle", async () => {
      const storage = s3Storage(testConfig());

      const target = await storage.presignUpload({
        key: "photos/u1/abc.jpg",
        contentType: "image/jpeg",
        maxBytes: 5 * 1024 * 1024,
      });

      // Path-style puts the bucket in the path (…/test-bucket/photos/…)
      // rather than the hostname (test-bucket.127.0.0.1…) — the shape
      // LocalStack/MinIO require.
      expect(target.uploadUrl).toContain("127.0.0.1:4566/test-bucket/");
    });

    it("signs a different key into a different URL", async () => {
      const storage = s3Storage(testConfig());

      const first = await storage.presignUpload({
        key: "photos/u1/one.jpg",
        contentType: "image/jpeg",
        maxBytes: 1024,
      });
      const second = await storage.presignUpload({
        key: "photos/u1/two.jpg",
        contentType: "image/jpeg",
        maxBytes: 1024,
      });

      expect(first.uploadUrl).not.toBe(second.uploadUrl);
    });
  });

  describe("presignDownload", () => {
    it("returns a short-lived (120s) GET URL carrying the bucket, key, and a real SigV4 signature", async () => {
      const storage = s3Storage(testConfig());
      const key = "photos/u1/abc.jpg";

      const url = await storage.presignDownload(key);

      expect(url).toContain("test-bucket");
      expect(url).toContain(key);
      expect(url).toContain("X-Amz-Signature");
      expect(url).toContain("X-Amz-Expires=120");
    });
  });

  describe("without an endpoint override", () => {
    it("signs a virtual-hosted-style URL against real AWS (no forcePathStyle)", async () => {
      const storage = s3Storage({
        region: "ap-south-1",
        bucket: "test-bucket",
        accessKeyId: "dummy",
        secretAccessKey: "dummy",
      });

      const url = await storage.presignDownload("kyc/u1/pan.pdf");

      // No endpoint override ⇒ the real AWS S3 hostname, bucket as a
      // subdomain — the default addressing style, not the LocalStack one.
      expect(url).toContain("test-bucket.s3.ap-south-1.amazonaws.com");
    });
  });
});
