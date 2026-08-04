import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertIndexes, isConnected } from "./db.js";
import { startTestMongo, stopTestMongo } from "../test/mongo.js";

/**
 * A model whose unique index exists only to be tested. Declared here rather
 * than reusing a domain model so this file tests the mechanism, not a schema
 * that might change for unrelated reasons.
 */
const widgetSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  name: String,
});
const Widget = mongoose.model("IndexProbeWidget", widgetSchema);

beforeAll(async () => {
  await startTestMongo();
}, 60_000);

afterAll(async () => {
  await stopTestMongo();
});

describe("connectDb", () => {
  it("establishes a live connection", () => {
    expect(isConnected()).toBe(true);
  });
});

describe("assertIndexes is load-bearing", () => {
  // Before trusting any of the assertions below, prove they CAN fail.
  //
  // connectDb sets autoIndex: false, so nothing builds indexes implicitly. If
  // it were left on, Mongoose would build them on its own and every test in
  // this file would pass with assertIndexes() replaced by a no-op — and a
  // check that cannot fail is not a check.
  //
  // Runs on its own model, cleaned up at the end: while duplicate rows exist,
  // assertIndexes() correctly refuses to build the index, which would fail
  // every later test in this file.
  it("without it, a unique constraint simply is not there", async () => {
    const schema = new mongoose.Schema({ slug: { type: String, unique: true } });
    const Unsynced = mongoose.model("IndexProbeUnsynced", schema);

    try {
      await Unsynced.create({ slug: "dup" });

      // No syncIndexes() for this model, so the index does not exist and Mongo
      // has nothing to reject on. This resolving is the proof.
      await expect(Unsynced.create({ slug: "dup" })).resolves.toBeDefined();

      // And the corollary worth pinning: asked to build an index that the
      // existing data violates, assertIndexes FAILS rather than skipping it.
      // A boot that continues without the constraint is the bad outcome.
      await expect(assertIndexes()).rejects.toThrow(/duplicate key|Index build failed/i);
    } finally {
      await Unsynced.collection.drop().catch((error: unknown) => {
        // Collection may not exist if create() failed; anything else is real.
        if (!(error instanceof Error) || !/ns not found/i.test(error.message)) throw error;
      });
      mongoose.deleteModel("IndexProbeUnsynced");
    }
  });
});

describe("assertIndexes", () => {
  // The assertion that matters. A declared-but-unbuilt index looks exactly
  // like a working one — same code, same schema, same green tests — right up
  // until two production rows collide and the "unique" field turns out to have
  // duplicates. Mongoose's default autoIndex builds in the background and
  // routes failures to a connection event nobody listens to, so nothing else
  // in the system would report it.
  it("actually builds the unique index, so duplicates are rejected", async () => {
    await assertIndexes();

    await Widget.create({ slug: "only-one", name: "first" });

    await expect(Widget.create({ slug: "only-one", name: "second" })).rejects.toThrow(
      /duplicate key/i,
    );
  });

  it("permits distinct values", async () => {
    await assertIndexes();

    await Widget.create({ slug: "alpha" });
    await expect(Widget.create({ slug: "beta" })).resolves.toBeDefined();
  });

  it("reports the index to Mongo, not just to Mongoose", async () => {
    await assertIndexes();

    // Read the indexes back from the server. Asking Mongoose what it declared
    // would just be asking the schema to confirm itself.
    const indexes = (await Widget.collection.indexes()) as { key: Record<string, number> }[];
    const slugIndex = indexes.find((index) => index.key["slug"] !== undefined);

    expect(slugIndex).toBeDefined();
  });

  it("is safe to run twice, since it runs on every boot", async () => {
    await assertIndexes();
    await expect(assertIndexes()).resolves.toBeUndefined();
  });
});
