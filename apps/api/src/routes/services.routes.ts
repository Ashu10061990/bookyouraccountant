import type { FastifyInstance } from "fastify";
import { API_V1_PREFIX } from "../constants/index.js";
import {
  createServiceHandler,
  listServicesHandler,
  updateServiceHandler,
} from "../controllers/services.controller.js";
import { type AuthDeps, requireAuth, requireRole } from "../middlewares/auth.middleware.js";

/**
 * HTTP surface for the service catalogue. No business logic, no Mongoose.
 *
 * Legacy rule: `allow read: if true; allow write: if isAdmin();`
 */
export function registerServiceRoutes(app: FastifyInstance, deps: AuthDeps): void {
  // Public, exactly as in the legacy rules — the marketing site lists services
  // to signed-out visitors.
  app.get(`${API_V1_PREFIX}/services`, listServicesHandler);

  app.post(
    `${API_V1_PREFIX}/services`,
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    createServiceHandler,
  );

  app.patch<{ Params: { id: string } }>(
    `${API_V1_PREFIX}/services/:id`,
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    updateServiceHandler,
  );
}
