import { CONFIG_DOCS, type ConfigDoc } from "@bya/shared";
import mongoose, { type Model } from "mongoose";

/**
 * The `config` collection: one document per named configuration blob.
 *
 * Mirrors the legacy `config/{docId}` — readable by any signed-in user,
 * writable only by an admin. Holds `platformFees` (the payout engine's rates)
 * and `complianceOverrides` (due-date extensions pushed the moment CBDT/CBIC
 * notifies one).
 *
 * `value` is `Mixed` because the two documents have genuinely different
 * shapes. Type safety comes from the per-document Zod schema in
 * `CONFIG_SCHEMAS`, applied before anything is written — not from Mongoose.
 */
export interface ConfigDocument {
  name: ConfigDoc;
  value: unknown;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new mongoose.Schema<ConfigDocument>(
  {
    name: { type: String, required: true, unique: true, index: true, enum: CONFIG_DOCS },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    /** Which admin last wrote it. A minimal stand-in until the §6.7 audit log. */
    updatedBy: { type: String, required: false },
  },
  { timestamps: true, collection: "config" },
);

export const ConfigModel: Model<ConfigDocument> =
  (mongoose.models["Config"] as Model<ConfigDocument> | undefined) ??
  mongoose.model<ConfigDocument>("Config", schema);
