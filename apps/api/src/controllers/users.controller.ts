import { createUserSchema, updateUserSchema } from "@bya/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { contextOf, tokenUidOf } from "../middlewares/auth.middleware.js";
import { parseBody } from "../middlewares/validate.middleware.js";
import * as service from "../services/users.service.js";

/**
 * Handlers for users. Method, URL and preHandlers live in
 * `routes/users.routes.ts`.
 */

/**
 * Creates the caller's own user record.
 *
 * The uid comes from the verified token. A `authUid` in the body is
 * ignored — the shared schema has no such field and strips unknown keys —
 * so a caller cannot create a record for anyone but themselves.
 */
export async function createUserHandler(request: FastifyRequest, reply: FastifyReply) {
  const input = parseBody(createUserSchema, request.body);
  const created = await service.createUser(tokenUidOf(request), input);

  return reply.status(201).send({ user: created });
}

export async function getOwnUserHandler(request: FastifyRequest) {
  return { user: await service.getOwnUser(contextOf(request).uid) };
}

export async function updateOwnUserHandler(request: FastifyRequest) {
  const changes = parseBody(updateUserSchema, request.body);
  return { user: await service.updateOwnUser(contextOf(request).uid, changes) };
}
