import { createBusinessSchema, orgPanSubmissionSchema, updateBusinessSchema } from "@bya/shared";
import type { FastifyInstance } from "fastify";
import {
  type AuthDeps,
  contextOf,
  requireAuth,
  requireRole,
  requireVerifiedToken,
  tokenUidOf,
} from "../../platform/auth.js";
import type { Cipher } from "../../platform/crypto.js";
import { parseBody } from "../../platform/validate.js";
import * as service from "./businesses.service.js";
import { businessView } from "./businesses.serializers.js";

/**
 * HTTP surface for businesses.
 *
 * There is no public listing route at all — not a guarded one, none. The
 * cheapest way to guarantee businesses are never browsable is for no endpoint
 * to exist that could return more than one.
 */
export function registerBusinessRoutes(app: FastifyInstance, deps: AuthDeps, cipher: Cipher): void {
  app.post("/v1/businesses", { preHandler: requireVerifiedToken(deps) }, async (request, reply) => {
    const input = parseBody(createBusinessSchema, request.body);
    const ctx = { uid: tokenUidOf(request), role: "business" as const, blocked: false };
    const created = await service.createProfile(ctx, input, request.body);

    return reply.status(201).send({ business: businessView(created) });
  });

  app.get("/v1/businesses/me", { preHandler: requireAuth(deps) }, async (request) => {
    const ctx = contextOf(request);
    return { business: businessView(await service.getForViewer(ctx, ctx.uid)) };
  });

  app.get<{ Params: { uid: string } }>(
    "/v1/businesses/:uid",
    { preHandler: requireAuth(deps) },
    async (request) => {
      const ctx = contextOf(request);
      return { business: businessView(await service.getForViewer(ctx, request.params.uid)) };
    },
  );

  app.patch("/v1/businesses/me", { preHandler: requireAuth(deps) }, async (request) => {
    const ctx = contextOf(request);
    const changes = parseBody(updateBusinessSchema, request.body);

    return { business: businessView(await service.updateOwnProfile(ctx, changes, request.body)) };
  });

  /**
   * The org PAN has its own endpoint rather than being a profile field.
   *
   * That is what makes the legacy immutability rule structural: there is no
   * profile-update path through which it can be altered, so the guarantee does
   * not depend on the client form omitting it.
   */
  app.put("/v1/businesses/me/org-pan", { preHandler: requireAuth(deps) }, async (request) => {
    const ctx = contextOf(request);
    const input = parseBody(orgPanSubmissionSchema, request.body);

    return { business: businessView(await service.submitOrgPan(ctx, input, cipher)) };
  });

  app.get<{ Params: { uid: string } }>(
    "/v1/businesses/:uid/org-pan",
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    async (request) => service.readOrgPanPlaintext(contextOf(request), request.params.uid, cipher),
  );
}
