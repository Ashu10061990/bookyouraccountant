import { leadUpsertSchema } from "@bya/shared";
import type { FastifyRequest } from "fastify";
import { contextOf, tokenUidOf } from "../middlewares/auth.middleware.js";
import { parseBody } from "../middlewares/validate.middleware.js";
import * as service from "../services/leads.service.js";

/**
 * Handlers for leads. Method, URL and preHandlers live in
 * `routes/leads.routes.ts`.
 *
 * A note on error handling, deliberately different from the legacy app: there,
 * lead capture is wrapped in `catch (leadErr) { console.warn(...) }`
 * (`SignIn.jsx`), one of roughly twenty swallowed errors. A lead silently
 * failing to save is a marketing spend that produced nothing anyone can see.
 * Here a failure propagates to the error handler, is logged with its request
 * id, and reaches the client.
 */

/**
 * Captured at OTP, before the user has a user record — hence the
 * `requireVerifiedToken` guard on the route. The uid comes from the token.
 */
export async function upsertOwnLeadHandler(request: FastifyRequest) {
  const input = parseBody(leadUpsertSchema, request.body);
  return { lead: await service.upsertOwnLead(tokenUidOf(request), input) };
}

export async function getOwnLeadHandler(request: FastifyRequest) {
  return { lead: await service.getOwnLead(tokenUidOf(request)) };
}

export async function listLeadsHandler(request: FastifyRequest) {
  // Read through the context so the admin identity is on the request that
  // listed every lead in the system — the §6.7 audit log will want it.
  contextOf(request);
  return { leads: await service.listLeads() };
}
