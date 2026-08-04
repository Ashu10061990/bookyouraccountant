import type { FastifyInstance } from "fastify";
import { API_V1_PREFIX } from "../constants/index.js";
import {
  getOwnLeadHandler,
  listLeadsHandler,
  upsertOwnLeadHandler,
} from "../controllers/leads.controller.js";
import {
  type AuthDeps,
  requireAuth,
  requireRole,
  requireVerifiedToken,
} from "../middlewares/auth.middleware.js";

/**
 * HTTP surface for leads. Handler bodies (and the note on why lead-capture
 * errors are never swallowed here) live in `controllers/leads.controller.ts`.
 */
export function registerLeadRoutes(app: FastifyInstance, deps: AuthDeps): void {
  /**
   * Captured at OTP, before the user has a user record — so this uses
   * `requireVerifiedToken`, like user creation. The uid comes from the token.
   */
  app.put(
    `${API_V1_PREFIX}/leads/me`,
    { preHandler: requireVerifiedToken(deps) },
    upsertOwnLeadHandler,
  );

  app.get(
    `${API_V1_PREFIX}/leads/me`,
    { preHandler: requireVerifiedToken(deps) },
    getOwnLeadHandler,
  );

  app.get(
    `${API_V1_PREFIX}/leads`,
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    listLeadsHandler,
  );
}
