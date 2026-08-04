import type { ConfigDoc } from "@bya/shared";
import type { ClientSession } from "mongoose";
import { ConfigModel, type ConfigDocument } from "../models/config.model.js";

/** Data access for config. The only file in this module importing Mongoose. */

export interface ConfigView {
  name: ConfigDoc;
  value: unknown;
  updatedAt: Date;
  updatedBy?: string;
}

function toView(document: ConfigDocument): ConfigView {
  return {
    name: document.name,
    value: document.value,
    updatedAt: document.updatedAt,
    ...(document.updatedBy === undefined ? {} : { updatedBy: document.updatedBy }),
  };
}

export async function findByName(name: ConfigDoc): Promise<ConfigView | null> {
  const document = await ConfigModel.findOne({ name }).lean<ConfigDocument | null>().exec();
  return document === null ? null : toView(document);
}

export async function upsert(
  name: ConfigDoc,
  value: unknown,
  updatedBy: string,
  session?: ClientSession,
): Promise<ConfigView> {
  const updated = await ConfigModel.findOneAndUpdate(
    { name },
    { $set: { value, updatedBy }, $setOnInsert: { name } },
    { new: true, upsert: true, ...(session === undefined ? {} : { session }) },
  )
    .lean<ConfigDocument>()
    .exec();

  return toView(updated);
}
