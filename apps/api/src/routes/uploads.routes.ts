import type { FastifyInstance } from "fastify";
import { API_V1_PREFIX } from "../constants/index.js";
import { presignUploadHandler } from "../controllers/uploads.controller.js";
import { type AuthDeps, requireAuth } from "../middlewares/auth.middleware.js";

/**
 * HTTP surface for file uploads — spec
 * `docs/specs/2026-07-25-s3-storage-slice.md`, "Endpoints".
 *
 * One route: a caller proposes a scope + filename, never a key. The owner-
 * scoping rationale lives with the handler in
 * `controllers/uploads.controller.ts`.
 */
export function registerUploadRoutes(app: FastifyInstance, auth: AuthDeps): void {
  app.post(
    `${API_V1_PREFIX}/uploads/presign`,
    { preHandler: requireAuth(auth) },
    presignUploadHandler,
  );
}
