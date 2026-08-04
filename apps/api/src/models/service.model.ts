import mongoose, { type Model } from "mongoose";

/**
 * The `services` collection.
 *
 * Mirrors the legacy Firestore collection of the same name, which is
 * world-readable and admin-writable. Ids are stable slugs, not generated keys:
 * assignments, SOP templates and the pricing engine all reference services by
 * these exact strings.
 */
export interface ServiceDocument {
  id: string;
  name: string;
  active: boolean;
  /** Firestore document id, for traceability through the §14 migration. */
  legacyId?: string;
}

const schema = new mongoose.Schema<ServiceDocument>(
  {
    // Unique because two services sharing an id would make every downstream
    // lookup ambiguous — including the ones that price work.
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    active: { type: Boolean, required: true, default: true },
    legacyId: { type: String, required: false },
  },
  { timestamps: true, collection: "services" },
);

/**
 * Registered once per process. Vitest can import a module more than once in a
 * worker, and `mongoose.model()` throws OverwriteModelError on the second call.
 */
export const ServiceModel: Model<ServiceDocument> =
  (mongoose.models["Service"] as Model<ServiceDocument> | undefined) ??
  mongoose.model<ServiceDocument>("Service", schema);
