import { CONFIG_DOCS, CONFIG_SCHEMAS, PAYOUT_RATES, type ConfigDoc } from "@bya/shared";
import type { ClientSession } from "mongoose";
import { badRequest, notFound } from "../../platform/errors.js";
import * as repository from "./config.repository.js";
import type { ConfigView } from "./config.repository.js";

/**
 * Business rules for runtime configuration.
 *
 * Legacy rule being replaced:
 * ```
 * match /config/{docId} { allow read: if isSignedIn(); allow write: if isAdmin(); }
 * ```
 *
 * Read is any authenticated role; write is admin-only, enforced by
 * `requireRole("admin")` on the route.
 */

/** Narrows an arbitrary path segment to a known config document name. */
export function assertConfigDoc(name: string): ConfigDoc {
  const match = CONFIG_DOCS.find((doc) => doc === name);

  // A 404 rather than creating whatever was asked for. An admin typo must not
  // mint `platformFee` (singular) alongside `platformFees` — the payout engine
  // reads one exact name, and would silently keep using defaults while the
  // operator believed they had changed the rates.
  if (match === undefined) {
    throw notFound(`No configuration document named "${name}".`);
  }

  return match;
}

/**
 * Reads a config document, falling back to the shipped defaults.
 *
 * The fallback matters: the payout engine must have rates on day one, before
 * any admin has written the document. This mirrors the legacy
 * `{ ...PAYOUT_DEFAULTS, ...(snap.exists ? snap.data() : {}) }`.
 */
export async function getConfig(name: ConfigDoc): Promise<ConfigView> {
  const stored = await repository.findByName(name);

  if (stored !== null) return stored;

  if (name === "platformFees") {
    return { name, value: PAYOUT_RATES, updatedAt: new Date(0) };
  }

  throw notFound(`Configuration "${name}" has not been set.`);
}

/**
 * Writes a config document after validating it against *its own* schema.
 *
 * The per-document lookup is the point. Validating both documents against one
 * permissive shape would let an admin save a compliance calendar over the
 * payout rates, and the engine would then read every rate as undefined.
 */
export async function setConfig(
  name: ConfigDoc,
  body: unknown,
  updatedBy: string,
  session?: ClientSession,
): Promise<ConfigView> {
  const schema = CONFIG_SCHEMAS[name];
  const result = schema.safeParse(body);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");

    throw badRequest(`Invalid ${name} configuration — ${details}`);
  }

  return repository.upsert(name, result.data, updatedBy, session);
}
