import type { FastifyInstance } from "fastify";
import { API_V1_PREFIX } from "../constants/index.js";
import {
  createUserHandler,
  getOwnUserHandler,
  updateOwnUserHandler,
} from "../controllers/users.controller.js";
import {
  type AuthDeps,
  requireAuth,
  requireVerifiedToken,
} from "../middlewares/auth.middleware.js";

/**
 * HTTP surface for users.
 *
 * Every route is scoped to the caller — `/me`, never `/:uid`. There is
 * deliberately no endpoint that takes another user's id: the legacy rules
 * allowed admins to read any user document, but nothing in this phase needs
 * that, and an admin read path is exactly the kind of endpoint that should
 * arrive with an audit-log entry attached (§6.7, deferred).
 */
export function registerUserRoutes(app: FastifyInstance, deps: AuthDeps): void {
  /**
   * Creates the caller's own user record.
   *
   * The one route that uses `requireVerifiedToken` rather than `requireAuth`:
   * at this moment the token is valid but no user row exists yet, and
   * `requireAuth` rejects exactly that case.
   */
  app.post(`${API_V1_PREFIX}/users`, { preHandler: requireVerifiedToken(deps) }, createUserHandler);

  app.get(`${API_V1_PREFIX}/users/me`, { preHandler: requireAuth(deps) }, getOwnUserHandler);

  app.patch(`${API_V1_PREFIX}/users/me`, { preHandler: requireAuth(deps) }, updateOwnUserHandler);
}
