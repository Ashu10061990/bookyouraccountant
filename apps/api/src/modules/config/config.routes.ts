import type { FastifyInstance } from "fastify";
import { type AuthDeps, contextOf, requireAuth, requireRole } from "../../platform/auth.js";
import * as service from "./config.service.js";

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
    "/v1/config/:name",
    { preHandler: requireAuth(deps) },
    async (request) => ({
      config: await service.getConfig(service.assertConfigDoc(request.params.name)),
    }),
  );

  app.put<{ Params: { name: string } }>(
    "/v1/config/:name",
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    async (request) => {
      const name = service.assertConfigDoc(request.params.name);

      // The admin's uid is recorded on the document — a minimal stand-in for
      // the append-only audit log in §6.7, which is deferred but which this
      // endpoint will eventually write to.
      const config = await service.setConfig(name, request.body, contextOf(request).uid);

      return { config };
    },
  );
}
