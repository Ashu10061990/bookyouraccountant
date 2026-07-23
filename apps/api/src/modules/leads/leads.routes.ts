import { leadUpsertSchema } from "@bya/shared";
import type { FastifyInstance } from "fastify";
import {
  type AuthDeps,
  contextOf,
  requireAuth,
  requireRole,
  requireVerifiedToken,
  tokenUidOf,
} from "../../platform/auth.js";
import { parseBody } from "../../platform/validate.js";
import * as service from "./leads.service.js";

/**
 * HTTP surface for leads.
 *
 * A note on error handling, deliberately different from the legacy app: there,
 * lead capture is wrapped in `catch (leadErr) { console.warn(...) }`
 * (`SignIn.jsx`), one of roughly twenty swallowed errors. A lead silently
 * failing to save is a marketing spend that produced nothing anyone can see.
 * Here a failure propagates to the error handler, is logged with its request
 * id, and reaches the client.
 */
export function registerLeadRoutes(app: FastifyInstance, deps: AuthDeps): void {
  /**
   * Captured at OTP, before the user has a user record — so this uses
   * `requireVerifiedToken`, like user creation. The uid comes from the token.
   */
  app.put("/v1/leads/me", { preHandler: requireVerifiedToken(deps) }, async (request) => {
    const input = parseBody(leadUpsertSchema, request.body);
    return { lead: await service.upsertOwnLead(tokenUidOf(request), input) };
  });

  app.get("/v1/leads/me", { preHandler: requireVerifiedToken(deps) }, async (request) => ({
    lead: await service.getOwnLead(tokenUidOf(request)),
  }));

  app.get(
    "/v1/leads",
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    async (request) => {
      // Read through the context so the admin identity is on the request that
      // listed every lead in the system — the §6.7 audit log will want it.
      contextOf(request);
      return { leads: await service.listLeads() };
    },
  );
}
