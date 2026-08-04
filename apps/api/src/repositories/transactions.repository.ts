import mongoose, { type ClientSession } from "mongoose";

/**
 * The one place a service may obtain a MongoDB session from.
 *
 * Layering rule: models and repositories are the only production files that
 * import Mongoose. Services that need a transaction (audit's write-with-record,
 * the exam submit) get their session here instead of importing the driver —
 * the `ClientSession` type is re-exported alongside so their signatures can
 * name it without reaching for `mongoose` either.
 */

export type { ClientSession } from "mongoose";

/** Opens a driver session for a `withTransaction` block. Caller must end it. */
export function startDbSession(): Promise<ClientSession> {
  return mongoose.startSession();
}
