import mongoose from "mongoose";

/**
 * The Mongoose connection.
 *
 * This is the only module outside a repository that imports mongoose. The
 * layering rule — repositories are the only Mongoose importers — is what keeps
 * services unit-testable without a database, and what will keep the payout
 * engine testable when it lands.
 */

export interface ConnectOptions {
  /** Fail fast at boot rather than hanging while a bad host is retried. */
  serverSelectionTimeoutMS?: number;
}

export async function connectDb(uri: string, options: ConnectOptions = {}): Promise<void> {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: options.serverSelectionTimeoutMS ?? 5_000,
    // Mongo's own retry, not ours: a transient primary election should not
    // surface to the caller as a failed request.
    retryWrites: true,
    // Index building is an explicit, awaited, fail-loud step — see
    // assertIndexes below. Left on (the default), every replica races to build
    // the same indexes on boot and any failure lands on a connection event
    // with no listener, so a missing unique constraint never surfaces.
    autoIndex: false,
  });
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

/** True when a live connection exists. */
export function isConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

/**
 * Builds every index declared on every registered model, and waits for them.
 *
 * Mongoose's default `autoIndex` builds indexes in the background and swallows
 * failures into a connection event nobody listens to — so a unique index that
 * failed to build (say, because existing data already violates it) leaves the
 * app running with the constraint silently absent. Since these indexes encode
 * real invariants — one user per Firebase uid, one lead per user — a missing
 * one is a correctness bug, not a performance one.
 *
 * `syncIndexes` also drops indexes no longer declared, keeping the deployed
 * shape equal to the declared shape rather than the union of every shape ever
 * deployed.
 *
 * Errors are rethrown: a failed index build must stop the boot, not warn.
 */
export async function assertIndexes(): Promise<void> {
  const models = Object.values(mongoose.models);

  for (const model of models) {
    await model.syncIndexes();
  }
}
