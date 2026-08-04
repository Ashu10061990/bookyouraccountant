import type { FastifyRequest } from "fastify";
import { contextOf } from "../middlewares/auth.middleware.js";
import { AUDIT_ACTIONS, withAudit } from "../services/audit.service.js";
import * as service from "../services/config.service.js";

/**
 * Handlers for runtime configuration. Method, URL and preHandlers live in
 * `routes/config.routes.ts`.
 */

export async function getConfigHandler(request: FastifyRequest<{ Params: { name: string } }>) {
  return {
    config: await service.getConfig(service.assertConfigDoc(request.params.name)),
  };
}

export async function putConfigHandler(request: FastifyRequest<{ Params: { name: string } }>) {
  const name = service.assertConfigDoc(request.params.name);
  const actor = contextOf(request);

  // Changing platformFees changes what every accountant is paid, so it is
  // exactly the kind of admin override §6.7 requires an immutable record
  // of. The entry commits in the same transaction as the write.
  const config = await withAudit(
    {
      action: AUDIT_ACTIONS.CONFIG_UPDATE,
      actor,
      subjectType: "config",
      subjectId: name,
    },
    async (session) => ({
      result: await service.setConfig(name, request.body, actor.uid, session),
      subjectId: name,
    }),
  );

  return { config };
}
