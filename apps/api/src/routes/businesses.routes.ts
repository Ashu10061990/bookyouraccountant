import type { FastifyInstance } from "fastify";
import { API_V1_PREFIX } from "../constants/index.js";
import {
  createBusinessHandler,
  getBusinessHandler,
  getOwnBusinessHandler,
  readOrgPanHandler,
  submitOrgPanHandler,
  updateOwnBusinessHandler,
} from "../controllers/businesses.controller.js";
import type { Cipher } from "../helpers/crypto.helper.js";
import {
  type AuthDeps,
  requireAuth,
  requireRole,
  requireVerifiedToken,
} from "../middlewares/auth.middleware.js";

/**
 * HTTP surface for businesses.
 *
 * There is no public listing route at all — not a guarded one, none. The
 * cheapest way to guarantee businesses are never browsable is for no endpoint
 * to exist that could return more than one.
 */
export function registerBusinessRoutes(app: FastifyInstance, deps: AuthDeps, cipher: Cipher): void {
  app.post(
    `${API_V1_PREFIX}/businesses`,
    { preHandler: requireVerifiedToken(deps) },
    createBusinessHandler,
  );

  app.get(
    `${API_V1_PREFIX}/businesses/me`,
    { preHandler: requireAuth(deps) },
    getOwnBusinessHandler,
  );

  app.get<{ Params: { uid: string } }>(
    `${API_V1_PREFIX}/businesses/:uid`,
    { preHandler: requireAuth(deps) },
    getBusinessHandler,
  );

  app.patch(
    `${API_V1_PREFIX}/businesses/me`,
    { preHandler: requireAuth(deps) },
    updateOwnBusinessHandler,
  );

  /**
   * The org PAN has its own endpoint rather than being a profile field —
   * see `controllers/businesses.controller.ts` for why that is structural.
   */
  app.put(
    `${API_V1_PREFIX}/businesses/me/org-pan`,
    { preHandler: requireAuth(deps) },
    submitOrgPanHandler(cipher),
  );

  app.get<{ Params: { uid: string } }>(
    `${API_V1_PREFIX}/businesses/:uid/org-pan`,
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    readOrgPanHandler(cipher),
  );
}
