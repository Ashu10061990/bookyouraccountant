import {
  SERVICES,
  type CreateServiceInput,
  type Service,
  type UpdateServiceInput,
} from "@bya/shared";
import { conflict, notFound } from "../errors/app-error.js";
import * as repository from "../repositories/services.repository.js";

/**
 * Business rules for the service catalogue.
 *
 * Legacy rule being replaced:
 *   match /services/{id} { allow read: if true; allow write: if isAdmin(); }
 *
 * The read half is public here too. The write half is enforced by
 * `requireRole("admin")` on the route, and asserted by the denial suite —
 * this layer assumes the caller is already authorized and concerns itself only
 * with whether the operation makes sense.
 */

export function listServices(options: { includeInactive?: boolean } = {}): Promise<Service[]> {
  return repository.findAll(options);
}

export async function createService(input: CreateServiceInput): Promise<Service> {
  const existing = await repository.findById(input.id);

  // Not a unique-index race guard — that is Mongo's job, and it holds. This is
  // so the caller gets a 409 with a useful message instead of a raw driver
  // error surfacing as a 500.
  if (existing !== null) {
    throw conflict(`A service with id "${input.id}" already exists.`);
  }

  return repository.insert(input);
}

export async function updateService(id: string, changes: UpdateServiceInput): Promise<Service> {
  const updated = await repository.updateById(id, changes);

  if (updated === null) {
    throw notFound(`No service with id "${id}".`);
  }

  return updated;
}

/**
 * Seeds the catalogue from the shared contract. Idempotent by id, so it is
 * safe to run on every deploy.
 *
 * Ships all seven services. Inventory §17.2 records that the legacy client's
 * `FALLBACK_SERVICES` contains one while every downstream engine defines
 * seven, so six services are invisible unless the legacy seed script was
 * actually run against production.
 */
export async function seedServices(): Promise<{ created: number; existing: number }> {
  let created = 0;

  for (const service of SERVICES) {
    const result = await repository.upsert(service);
    if (result.created) created += 1;
  }

  return { created, existing: SERVICES.length - created };
}
