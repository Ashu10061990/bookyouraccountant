import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { connectDb, disconnectDb } from "../platform/db.js";

/**
 * An in-memory MongoDB for tests: real Mongoose, real indexes, real
 * duplicate-key errors — just no Atlas.
 *
 * A mocked repository would let a test pass while the actual query, index or
 * unique constraint was wrong. Those are exactly the failures that only show up
 * with concurrent production traffic, so they are the ones worth catching here.
 */
let server: MongoMemoryServer | undefined;

export async function startTestMongo(): Promise<string> {
  server = await MongoMemoryServer.create();
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
