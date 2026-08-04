/** The API origin. Shared by the general client (`api.ts`) and the auth
 * client (`auth-client.ts`), which must not depend on each other. */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

/** A structured API error, carrying the server's stable `code` so callers can
 * branch (e.g. treat CONFLICT on bootstrap as success). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

/** Builds an `ApiError` from a non-OK response using the API's stable error
 * envelope `{error: {code, message}}` (see
 * `apps/api/src/middlewares/error-handler.middleware.ts`). */
export async function toApiError(response: Response): Promise<ApiError> {
  const parsed = (await response.json().catch(() => ({}))) as ErrorBody;
  return new ApiError(
    response.status,
    parsed.error?.code ?? "UNKNOWN",
    parsed.error?.message ?? `Request failed (${String(response.status)}).`,
  );
}

/** The error thrown when `fetch` itself fails (server down, no network). */
export const networkError = (): ApiError =>
  new ApiError(0, "NETWORK", "Can't reach the server. Is the API running on :8080?");
