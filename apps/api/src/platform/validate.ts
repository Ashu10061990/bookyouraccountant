import type { ZodType } from "zod";
import { badRequest } from "./errors.js";

/**
 * Validates a request body against a shared Zod schema.
 *
 * One place, so every route rejects malformed input identically and no route
 * can accidentally skip validation by reading `request.body` directly.
 *
 * Returns the *parsed* value, never the raw body. That matters: the schemas
 * strip unknown keys, so a client cannot smuggle `blocked`, `role: "admin"` or
 * `firebaseUid` through by adding fields the route did not expect. Passing the
 * raw body onward would silently undo that protection.
 */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");

    // The message names which field was wrong, which is safe — it echoes the
    // schema's expectations, not the submitted value.
    throw badRequest(details);
  }

  return result.data;
}
