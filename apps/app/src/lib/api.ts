import { API_BASE_URL, ApiError, toApiError, networkError } from "./api-error";
import { getAccessToken, refreshSession } from "./session";

// Re-exported so existing callers (`queries.ts`) keep importing it from here.
export { ApiError };

async function request<T>(method: string, path: string, body?: unknown, authed = true): Promise<T> {
  // One reactive refresh per request: on a 401 (or a missing access token,
  // e.g. after a proactive-refresh hiccup) we refresh once and replay; a
  // second failure falls through to the normal error path. `refreshSession`
  // is single-flight, so a burst of 401s spends only one refresh token.
  let refreshedOnce = false;

  for (;;) {
    const headers: Record<string, string> = {
      // ngrok's free tier serves an HTML interstitial to browser-like clients
      // unless this header is present. Harmless against any other backend, which
      // simply ignores the unknown header. (Demo tunnel; remove once on a real host.)
      "ngrok-skip-browser-warning": "true",
    };
    // Only declare a JSON content-type when there is actually a body. A POST that
    // carries `content-type: application/json` with an empty body makes Fastify's
    // body parser reject the request with 400 — which is exactly what bodyless
    // POSTs like /v1/exam/start would otherwise hit.
    if (body !== undefined) headers["content-type"] = "application/json";

    if (authed) {
      let token = getAccessToken();
      if (token === null && !refreshedOnce) {
        refreshedOnce = true;
        if (await refreshSession()) token = getAccessToken();
      }
      if (token === null) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
      headers.authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw networkError();
    }

    if (response.status === 401 && authed && !refreshedOnce) {
      refreshedOnce = true;
      // On success, replay with the new token; on failure `refreshSession`
      // has already torn the session down (signed out) and the 401 below
      // surfaces to the caller.
      if (await refreshSession()) continue;
    }

    if (!response.ok) throw await toApiError(response);

    return (await response.json()) as T;
  }
}

export const api = {
  get: <T>(path: string, authed = true): Promise<T> => request<T>("GET", path, undefined, authed),
  post: <T>(path: string, body?: unknown, authed = true): Promise<T> =>
    request<T>("POST", path, body, authed),
  patch: <T>(path: string, body?: unknown, authed = true): Promise<T> =>
    request<T>("PATCH", path, body, authed),
};
