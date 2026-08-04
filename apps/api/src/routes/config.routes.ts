import type { FastifyInstance } from "fastify";
import { API_V1_PREFIX } from "../constants/index.js";
import { getConfigHandler, putConfigHandler } from "../controllers/config.controller.js";
import { type AuthDeps, requireAuth, requireRole } from "../middlewares/auth.middleware.js";

/**
 * HTTP surface for runtime configuration.
 *
 * Legacy rule: `allow read: if isSignedIn(); allow write: if isAdmin();`
 *
 * Worth noting what building this now buys: `complianceOverrides` is the store
 * behind `ComplianceOverridesEditor`, an inventory §20 dead-code item — built,
 * imported by AdminHome, never rendered, so an admin currently cannot push a
 * due-date extension at all. With the backend in place, restoring it later is
 * a UI decision rather than a rebuild.
 */
export function registerConfigRoutes(app: FastifyInstance, deps: AuthDeps): void {
  app.get<{ Params: { name: string } }>(
    `${API_V1_PREFIX}/config/:name`,
    { preHandler: requireAuth(deps) },
    getConfigHandler,
  );

  app.put<{ Params: { name: string } }>(
    `${API_V1_PREFIX}/config/:name`,
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    putConfigHandler,
  );
}
