import type { FastifyInstance } from "fastify";
import {
  API_V1_PREFIX,
  AUTH_OTP_ROUTE_RATE_LIMIT,
  AUTH_REFRESH_ROUTE_RATE_LIMIT,
} from "../constants/index.js";
import {
  logoutHandler,
  refreshHandler,
  requestOtpHandler,
  verifyOtpHandler,
} from "../controllers/auth.controller.js";
import { type AuthDeps, requireVerifiedToken } from "../middlewares/auth.middleware.js";
import type { AuthServiceDeps } from "../services/auth.service.js";

/**
 * HTTP surface for first-party auth: phone OTP in, JWT + rotating refresh
 * token out.
 *
 * The OTP endpoints are anonymous by nature, so they carry their own
 * per-IP `@fastify/rate-limit` config on top of the global limiter — the
 * per-PHONE throttles (30s cooldown, 5/hour) live in the service, enforced
 * from the `otps` collection, where they hold across instances.
 *
 * Logout uses `requireVerifiedToken`, not `requireAuth`: a signed-in caller
 * who never created their user row must still be able to end their session.
 */
export function registerAuthRoutes(
  app: FastifyInstance,
  auth: AuthDeps,
  deps: AuthServiceDeps,
): void {
  app.post(
    `${API_V1_PREFIX}/auth/otp/request`,
    { config: { rateLimit: { ...AUTH_OTP_ROUTE_RATE_LIMIT } } },
    requestOtpHandler(deps),
  );

  app.post(
    `${API_V1_PREFIX}/auth/otp/verify`,
    { config: { rateLimit: { ...AUTH_OTP_ROUTE_RATE_LIMIT } } },
    verifyOtpHandler(deps),
  );

  app.post(
    `${API_V1_PREFIX}/auth/refresh`,
    { config: { rateLimit: { ...AUTH_REFRESH_ROUTE_RATE_LIMIT } } },
    refreshHandler(deps),
  );

  app.post(
    `${API_V1_PREFIX}/auth/logout`,
    { preHandler: requireVerifiedToken(auth) },
    logoutHandler(deps),
  );
}
