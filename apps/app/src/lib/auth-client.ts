import { API_BASE_URL, networkError, toApiError } from "./api-error";

/**
 * Typed client for the first-party OTP + JWT auth endpoints. Deliberately
 * separate from `api.ts`: these calls carry no bearer token from the session
 * store (they *produce* the session), so keeping them apart avoids an import
 * cycle auth-client → session → auth-client.
 */

/** Response of POST /v1/auth/otp/request. */
export interface OtpRequestResult {
  expiresInSec: number;
  resendAfterSec: number;
  /** Dev only: the OTP itself, so the local walkthrough works without SMS. */
  devOtp?: string;
}

/** Response of POST /v1/auth/otp/verify and /v1/auth/refresh. */
export interface AuthTokens {
  /** Short-lived (~15 min) JWT sent as the Bearer token on API calls. */
  accessToken: string;
  /** Long-lived (~30 days), *rotating*: each refresh returns a new one and
   * kills the old, so the latest must always be the one stored. */
  refreshToken: string;
  /** Access-token lifetime, drives the proactive refresh schedule. */
  expiresInSec: number;
  /** The server-issued identity of the signed-in user. */
  authUid: string;
}

/** POSTs a JSON body and returns the raw response, throwing `ApiError` on any
 * non-2xx. Every auth endpoint takes a body, so — unlike `api.ts` — a JSON
 * content-type is always correct here (bodyless requests must never set one). */
async function send(path: string, body: unknown, accessToken?: string): Promise<Response> {
  const headers: Record<string, string> = {
    // Same ngrok interstitial workaround as api.ts; harmless elsewhere.
    "ngrok-skip-browser-warning": "true",
    "content-type": "application/json",
  };
  if (accessToken !== undefined) headers.authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw networkError();
  }

  if (!response.ok) throw await toApiError(response);
  return response;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await send(path, body);
  return (await response.json()) as T;
}

/** Asks the server to text a 6-digit code. 429 (RATE_LIMITED) on throttle. */
export const requestOtp = (phone: string): Promise<OtpRequestResult> =>
  postJson<OtpRequestResult>("/v1/auth/otp/request", { phone });

/** Exchanges phone + code for tokens. 401 wrong, 410 expired, 429 locked. */
export const verifyOtp = (phone: string, otp: string): Promise<AuthTokens> =>
  postJson<AuthTokens>("/v1/auth/otp/verify", { phone, otp });

/** Rotates the refresh token; the returned pair replaces the old entirely. */
export const refreshTokens = (refreshToken: string): Promise<AuthTokens> =>
  postJson<AuthTokens>("/v1/auth/refresh", { refreshToken });

/** Revokes the refresh token server-side. 204 — nothing to parse. */
export async function logout(accessToken: string, refreshToken: string): Promise<void> {
  await send("/v1/auth/logout", { refreshToken }, accessToken);
}
