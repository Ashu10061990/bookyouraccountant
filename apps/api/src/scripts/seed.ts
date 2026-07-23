import { connectDb, disconnectDb, assertIndexes } from "../platform/db.js";
import { loadEnv } from "../platform/env.js";
import { seedServices } from "../modules/services/services.service.js";

/**
 * Seeds reference data into whatever database MONGODB_URI points at.
 *
 * Idempotent by design — safe to run on every deploy. Replaces the legacy
 * `functions/seed.js`, which needed a service-account key dropped next to it
 * and was therefore run by hand, if at all. Inventory §17.2 flags the
 * consequence: six of the seven services may never have existed in production.
 *
 *   pnpm --filter @bya/api seed
 */
const env = loadEnv();

await connectDb(env.MONGODB_URI);

try {
  await assertIndexes();
  const result = await seedServices();

  console.warn(
    `Seeded services: ${String(result.created)} created, ${String(result.existing)} already present.`,
  );
} finally {
  // Runs even if seeding throws, so a failed seed does not leave the process
  // hanging on an open connection.
  await disconnectDb();
}
