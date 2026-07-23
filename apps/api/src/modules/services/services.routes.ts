import { createServiceSchema, updateServiceSchema } from "@bya/shared";
import type { FastifyInstance } from "fastify";
import { type AuthDeps, requireAuth, requireRole } from "../../platform/auth.js";
import { parseBody } from "../../platform/validate.js";
import * as service from "./services.service.js";

/**
 * HTTP surface for the service catalogue. No business logic, no Mongoose.
 *
 * Legacy rule: `allow read: if true; allow write: if isAdmin();`
 */
export function registerServiceRoutes(app: FastifyInstance, deps: AuthDeps): void {
  // Public, exactly as in the legacy rules — the marketing site lists services
  // to signed-out visitors.
  app.get("/v1/services", async () => ({ services: await service.listServices() }));

  app.post(
    "/v1/services",
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    async (request, reply) => {
      const input = parseBody(createServiceSchema, request.body);
      const created = await service.createService(input);
      return reply.status(201).send({ service: created });
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/v1/services/:id",
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    async (request) => {
      const changes = parseBody(updateServiceSchema, request.body);
      return { service: await service.updateService(request.params.id, changes) };
    },
  );
}
