import { createBusinessSchema, orgPanSubmissionSchema, updateBusinessSchema } from "@bya/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { businessView } from "../helpers/businesses.serializer.js";
import type { Cipher } from "../helpers/crypto.helper.js";
import { contextOf, tokenUidOf } from "../middlewares/auth.middleware.js";
import { parseBody } from "../middlewares/validate.middleware.js";
import * as service from "../services/businesses.service.js";

/**
 * Handlers for businesses. Method, URL and preHandlers live in
 * `routes/businesses.routes.ts`.
 *
 * There is no public listing handler at all — not a guarded one, none. The
 * cheapest way to guarantee businesses are never browsable is for no endpoint
 * to exist that could return more than one.
 */

export async function createBusinessHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = parseBody(createBusinessSchema, request.body);
  const ctx = { uid: tokenUidOf(request), role: "business" as const, blocked: false };
  const created = await service.createProfile(ctx, input, request.body);

  return reply.status(201).send({ business: businessView(created) });
}

export async function getOwnBusinessHandler(request: FastifyRequest) {
  const ctx = contextOf(request);
  return { business: businessView(await service.getForViewer(ctx, ctx.uid)) };
}

export async function getBusinessHandler(request: FastifyRequest<{ Params: { uid: string } }>) {
  const ctx = contextOf(request);
  return { business: businessView(await service.getForViewer(ctx, request.params.uid)) };
}

export async function updateOwnBusinessHandler(request: FastifyRequest) {
  const ctx = contextOf(request);
  const changes = parseBody(updateBusinessSchema, request.body);

  return { business: businessView(await service.updateOwnProfile(ctx, changes, request.body)) };
}

/**
 * The org PAN has its own handler rather than being a profile field.
 *
 * That is what makes the legacy immutability rule structural: there is no
 * profile-update path through which it can be altered, so the guarantee does
 * not depend on the client form omitting it.
 */
export function submitOrgPanHandler(cipher: Cipher) {
  return async (request: FastifyRequest) => {
    const ctx = contextOf(request);
    const input = parseBody(orgPanSubmissionSchema, request.body);

    return { business: businessView(await service.submitOrgPan(ctx, input, cipher)) };
  };
}

export function readOrgPanHandler(cipher: Cipher) {
  return async (request: FastifyRequest<{ Params: { uid: string } }>) =>
    service.readOrgPanPlaintext(contextOf(request), request.params.uid, cipher);
}
