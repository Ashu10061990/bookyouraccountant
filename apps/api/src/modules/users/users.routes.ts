import { createUserSchema, updateUserSchema } from "@bya/shared";
import type { FastifyInstance } from "fastify";
import {
  type AuthDeps,
  contextOf,
  requireAuth,
  requireVerifiedToken,
  tokenUidOf,
} from "../../platform/auth.js";
import { parseBody } from "../../platform/validate.js";
import * as service from "./users.service.js";

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
   *
   * The uid comes from the verified token. A `firebaseUid` in the body is
   * ignored — the shared schema has no such field and strips unknown keys —
   * so a caller cannot create a record for anyone but themselves.
   */
  app.post("/v1/users", { preHandler: requireVerifiedToken(deps) }, async (request, reply) => {
    const input = parseBody(createUserSchema, request.body);
    const created = await service.createUser(tokenUidOf(request), input);

    return reply.status(201).send({ user: created });
  });

  app.get("/v1/users/me", { preHandler: requireAuth(deps) }, async (request) => ({
    user: await service.getOwnUser(contextOf(request).uid),
  }));

  app.patch("/v1/users/me", { preHandler: requireAuth(deps) }, async (request) => {
    const changes = parseBody(updateUserSchema, request.body);
    return { user: await service.updateOwnUser(contextOf(request).uid, changes) };
  });
}
