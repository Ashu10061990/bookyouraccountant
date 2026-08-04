import type { Service } from "@bya/shared";
import { ServiceModel } from "../models/service.model.js";

/**
 * Data access for services. The only file in this module that touches Mongoose
 * — which is what lets the service layer be tested without a database.
 *
 * No business rules live here. "Who may write a service" is a question for the
 * service layer; this file only knows how to read and write rows.
 */

function toService(document: { id: string; name: string; active: boolean }): Service {
  return { id: document.id, name: document.name, active: document.active };
}

export async function findAll(options: { includeInactive?: boolean } = {}): Promise<Service[]> {
  const filter = options.includeInactive === true ? {} : { active: true };
  const documents = await ServiceModel.find(filter).sort({ id: 1 }).lean().exec();
  return documents.map(toService);
}

export async function findById(id: string): Promise<Service | null> {
  const document = await ServiceModel.findOne({ id }).lean().exec();
  return document === null ? null : toService(document);
}

export async function insert(service: Service): Promise<Service> {
  const created = await ServiceModel.create(service);
  return toService(created);
}

export async function updateById(
  id: string,
  // `| undefined` because that is what Zod infers for `.optional()`, and
  // `exactOptionalPropertyTypes` treats "absent" and "present but undefined"
  // as different types.
  changes: { name?: string | undefined; active?: boolean | undefined },
): Promise<Service | null> {
  const updated = await ServiceModel.findOneAndUpdate({ id }, { $set: changes }, { new: true })
    .lean()
    .exec();

  return updated === null ? null : toService(updated);
}

/**
 * Idempotent upsert by id, for seeding.
 *
 * Returns whether the row already existed, so the seed can report what it did
 * rather than claiming success either way.
 */
export async function upsert(service: Service): Promise<{ created: boolean }> {
  const result = await ServiceModel.updateOne(
    { id: service.id },
    { $set: { name: service.name, active: service.active } },
    { upsert: true },
  ).exec();

  return { created: result.upsertedCount > 0 };
}
