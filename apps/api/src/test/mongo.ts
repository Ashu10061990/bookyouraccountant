import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../config/db.js";

/**
 * An in-memory MongoDB for tests: real Mongoose, real indexes, real
 * duplicate-key errors — just no Atlas.
 *
 * A mocked repository would let a test pass while the actual query, index or
 * unique constraint was wrong. Those are exactly the failures that only show up
 * with concurrent production traffic, so they are the ones worth catching here.
 *
 * ## Why a replica set rather than a standalone
 *
 * MongoDB only supports multi-document transactions on a replica set. Spec §6.7
 * requires the audit entry to be written **in the same transaction as the
 * action it records** — otherwise a crash between the two leaves either an
 * unrecorded admin override or an audit entry for something that never
 * happened, and for statutory records both are unacceptable.
 *
 * A standalone server would make every transactional test fail with
 * "Transaction numbers are only allowed on a replica set member or mongos",
 * which is a confusing way to discover an architectural requirement. Atlas is
 * always a replica set, so this also makes the test topology match production.
 * The cost is a slower start — seconds, once per test file.
 */
let server: MongoMemoryReplSet | undefined;

export async function startTestMongo(): Promise<string> {
  server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = server.getUri();
  await connectDb(uri, { serverSelectionTimeoutMS: 30_000 });
  return uri;
}

export async function stopTestMongo(): Promise<void> {
  await disconnectDb();
  await server?.stop();
  server = undefined;
}

/**
 * Empties every collection between tests, without dropping the database —
 * dropping would discard the indexes too, and then no test could catch a
 * missing unique constraint.
 */
export async function clearTestMongo(): Promise<void> {
  const { collections } = mongoose.connection;
  for (const collection of Object.values(collections)) {
    await collection.deleteMany({});
  }
}
