import type { FastifyRequest } from "fastify";
import { contextOf } from "../middlewares/auth.middleware.js";
import { parseBody } from "../middlewares/validate.middleware.js";
import { presignRequestSchema } from "../schemas/uploads.schema.js";
import * as service from "../services/uploads.service.js";

/**
 * Handler for file uploads — spec `docs/specs/2026-07-25-s3-storage-slice.md`,
 * "Endpoints". Method, URL and preHandlers live in `routes/uploads.routes.ts`.
 *
 * A caller proposes a scope + filename, never a key. The service derives the
 * real object key from the caller's own verified uid (`contextOf(request)`),
 * so the owner-scoping guarantee holds regardless of what the body contains.
 */
export async function presignUploadHandler(request: FastifyRequest) {
  const input = parseBody(presignRequestSchema, request.body);
  return await service.presignUpload(request.server.storage, contextOf(request), input);
}
