import type { RequestContext } from "../../platform/auth.js";
import {
  buildOwnedKey,
  maxBytesForScope,
  type StoragePort,
  type StorageScope,
  type UploadTarget,
} from "../../platform/storage.js";
import type { PresignRequestInput } from "./uploads.schema.js";

/**
 * Mints an owner-scoped presigned upload URL.
 *
 * This is the whole security core of the endpoint, and it is one line: the
 * key is built from `ctx.uid` — the caller's own token-verified identity —
 * never from anything in `input`. `PresignRequestInput` has no `uid`/`key`
 * field a client could set in the first place (see `uploads.schema.ts`), so
 * there is nothing to spoof: a caller can only ever request a key under its
 * own uid, whatever it sends.
 */
export async function presignUpload(
  storage: StoragePort,
  ctx: RequestContext,
  input: PresignRequestInput,
): Promise<UploadTarget> {
  // `presignRequestSchema` already checked `input.scope` against
  // `STORAGE_SCOPES`'s own keys at runtime, so every value reaching here is
  // genuinely a `StorageScope` — but zod's enum-from-string-array typing
  // (see the comment in `uploads.schema.ts`) widens the *inferred* type to
  // plain `string`. This cast restates the narrower type the runtime check
  // already guarantees; it does not itself perform any validation.
  const scope = input.scope as StorageScope;

  const key = buildOwnedKey(scope, ctx.uid, input.filename);

  return storage.presignUpload({
    key,
    contentType: input.contentType,
    maxBytes: maxBytesForScope(scope),
  });
}
