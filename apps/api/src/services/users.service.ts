import { SELF_ASSIGNABLE_ROLES, type CreateUserInput, type UpdateUserInput } from "@bya/shared";
import { conflict, forbidden, notFound } from "../errors/app-error.js";
import * as repository from "../repositories/users.repository.js";
import type { UserView } from "../repositories/users.repository.js";

/**
 * Business rules for users.
 *
 * ## The rules being replaced
 *
 * ```
 * match /users/{userId} {
 *   allow read:   if isOwner(userId) || isAdmin();
 *   allow create: if isOwner(userId)
 *                 && request.resource.data.role in ['business', 'accountant'];
 *   allow update: if isOwner(userId)
 *                 && (!('role' in request.resource.data)
 *                     || request.resource.data.role in ['business','accountant']);
 * }
 * ```
 *
 * Two independent guarantees hide in there, and both are re-implemented below:
 *
 * 1. **Ownership.** `isOwner(userId)` compared the authenticated uid to the
 *    document path. There is no document path here, so every function takes
 *    the uid from the verified token as its identity argument and no caller
 *    can pass someone else's.
 * 2. **No self-promotion.** The role whitelist excludes `admin`. Enforced
 *    twice — the shared schema will not parse it, and `assertSelfAssignable`
 *    below refuses it even if a future caller bypasses the schema.
 *
 * The second layer is not redundancy for its own sake: the schema guard lives
 * in a package the frontends also use, and someone will eventually relax it
 * for a legitimate client-side reason without realising it is load-bearing on
 * the server.
 */

/** Defence in depth against role escalation. */
function assertSelfAssignable(role: string | undefined): void {
  if (role === undefined) return;

  if (!SELF_ASSIGNABLE_ROLES.includes(role as (typeof SELF_ASSIGNABLE_ROLES)[number])) {
    throw forbidden("You cannot assign yourself that role.");
  }
}

/**
 * Creates the caller's own user document.
 *
 * `authUid` is a parameter, not a body field: identity comes from the
 * verified token. A uid in the request body is ignored entirely.
 */
export async function createUser(authUid: string, input: CreateUserInput): Promise<UserView> {
  assertSelfAssignable(input.role);

  const existing = await repository.findByAuthUid(authUid);
  if (existing !== null) {
    throw conflict("This account already exists.");
  }

  return repository.insert({ authUid, ...input });
}

export async function getOwnUser(authUid: string): Promise<UserView> {
  const user = await repository.findByAuthUid(authUid);

  if (user === null) {
    throw notFound("No account for this sign-in yet.");
  }

  return user;
}

export async function updateOwnUser(authUid: string, changes: UpdateUserInput): Promise<UserView> {
  assertSelfAssignable(changes.role);

  const updated = await repository.updateByAuthUid(authUid, changes);

  if (updated === null) {
    throw notFound("No account for this sign-in yet.");
  }

  return updated;
}

export function recordLogin(authUid: string): Promise<void> {
  return repository.touchLastLogin(authUid);
}
