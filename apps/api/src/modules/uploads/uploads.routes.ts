import type { FastifyInstance } from "fastify";
import { type AuthDeps, contextOf, requireAuth } from "../../platform/auth.js";
import { parseBody } from "../../platform/validate.js";
import { presignRequestSchema } from "./uploads.schema.js";
import * as service from "./uploads.service.js";

/**
 * HTTP surface for file uploads — spec
 * `docs/specs/2026-07-25-s3-storage-slice.md`, "Endpoints".
 *
 * One route: a caller proposes a scope + filename, never a key. The service
 * derives the real object key from the caller's own verified uid
 * (`contextOf(request)`), so the owner-scoping guarantee holds regardless of
 * what the body contains.
 */
export function registerUploadRoutes(app: FastifyInstance, auth: AuthDeps): void {
  app.post("/v1/uploads/presign", { preHandler: requireAuth(auth) }, async (request) => {
    const input = parseBody(presignRequestSchema, request.body);
    return await service.presignUpload(request.server.storage, contextOf(request), input);
  });
}
