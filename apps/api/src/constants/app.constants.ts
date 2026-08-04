/**
 * App-wide constants.
 *
 * Every value here was extracted from where it previously sat inline (app.ts,
 * a route file, a repository) — none is invented. Domain constants (pricing
 * tables, SOP templates, service catalogue, error codes) deliberately stay in
 * `@bya/shared`: that package is the client/server contract, and moving them
 * here would fork the single copy both frontends import.
 */

/** Every versioned route hangs off this prefix. */
export const API_V1_PREFIX = "/v1";

/**
 * The rate-limit window paired with `env.RATE_LIMIT_MAX` (requests per window
 * per IP). The max itself stays in the environment — configurable so tests
 * and load probes can raise it without disabling rate limiting.
 */
export const RATE_LIMIT_TIME_WINDOW = "1 minute";

/**
 * Public-listing pagination bounds (previously inline in the accountants
 * repository): the page size when the caller names none, and the ceiling a
 * caller-supplied limit is clamped to.
 */
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;

/**
 * Razorpay webhook headers. The signature header carries the HMAC over the
 * raw body — it IS the authentication on `POST /v1/payments/webhook`; the
 * event-id header is the idempotency key a redelivery is recognised by.
 */
export const RAZORPAY_SIGNATURE_HEADER = "x-razorpay-signature";
export const RAZORPAY_EVENT_ID_HEADER = "x-razorpay-event-id";
