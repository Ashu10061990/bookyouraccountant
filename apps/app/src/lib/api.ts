import { auth } from "./firebase.js";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

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

async function request<T>(method: string, path: string, body?: unknown, authed = true): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };

  if (authed) {
    const user = auth.currentUser;
    if (user === null) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
    headers.authorization = `Bearer ${await user.getIdToken()}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server. Is the API running on :8080?");
  }

  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(
      response.status,
      parsed.error?.code ?? "UNKNOWN",
      parsed.error?.message ?? `Request failed (${String(response.status)}).`,
    );
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, authed = true): Promise<T> => request<T>("GET", path, undefined, authed),
  post: <T>(path: string, body?: unknown, authed = true): Promise<T> =>
    request<T>("POST", path, body, authed),
};
