import { z } from "zod";
import { STORAGE_SCOPES } from "../../platform/storage.js";

/**
 * Body schema for `POST /v1/uploads/presign`.
 *
 * `scope` must be one of the whitelisted storage scopes, checked here at
 * runtime — `z.enum([...Object.keys(STORAGE_SCOPES)] ...)` derives the
 * allowed values from `STORAGE_SCOPES`'s own keys, so this can never drift
 * out of sync with the six scopes declared in `platform/storage.ts` (one
 * source of truth; add a scope there and this schema accepts it with no
 * edit here).
 *
 * `z.enum`'s parameter type wants `readonly string[]` with at least one
 * element (`[string, ...string[]]`); `Object.keys()` is typed plain
 * `string[]` (TypeScript does not narrow `Object.keys` to the object's
 * literal key union), so it does not satisfy that shape on its own — hence
 * the `as [string, ...string[]]` cast. This is a static-typing bridge only:
 * the cast does not change which *values* are in the array (still exactly
 * the six real keys), so `.safeParse` keeps rejecting anything else at
 * runtime. What it does cost is precision in the *inferred* type — with a
 * literal tuple type erased to `[string, ...string[]]`, `z.infer` widens
 * `scope` to plain `string` rather than the `StorageScope` union. That is
 * why `uploads.service.ts` re-narrows it with its own justified `as
 * StorageScope` immediately after this schema has already checked it
 * against the whitelist — this file guarantees the runtime property, that
 * file restates the resulting type.
 */
export const presignRequestSchema = z.object({
  scope: z.enum([...Object.keys(STORAGE_SCOPES)] as [string, ...string[]]),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
});

export type PresignRequestInput = z.infer<typeof presignRequestSchema>;
