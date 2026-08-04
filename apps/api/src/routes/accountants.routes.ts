import type { FastifyInstance } from "fastify";
import { API_V1_PREFIX } from "../constants/index.js";
import {
  createAccountantHandler,
  getAccountantHandler,
  type LatestExamPass,
  listAccountantsHandler,
  presignPhotoDownloadHandler,
  readKycHandler,
  submitKycHandler,
  updateOwnAccountantHandler,
  verifyAccountantHandler,
} from "../controllers/accountants.controller.js";
import type { Cipher } from "../helpers/crypto.helper.js";
import {
  type AuthDeps,
  requireAuth,
  requireRole,
  requireVerifiedToken,
} from "../middlewares/auth.middleware.js";

export type { LatestExamPass } from "../controllers/accountants.controller.js";

/**
 * HTTP surface for accountants. Handler bodies live in
 * `controllers/accountants.controller.ts`; every response there goes through
 * a serialiser.
 */
export function registerAccountantRoutes(
  app: FastifyInstance,
  deps: AuthDeps,
  cipher: Cipher,
  latestExamPass?: LatestExamPass,
): void {
  /**
   * The public marketplace listing.
   *
   * Public, like the legacy `publicAccountants` showcase — but returning the
   * *safe-field view*, where the legacy `accountants` rule
   * (`allow read: if isSignedIn() || resource.data.verified == true`) returned
   * whole documents including bank details. That is spec §18's accepted risk,
   * and this shape is what retires it.
   */
  app.get<{ Querystring: { city?: string; specialty?: string; limit?: string } }>(
    `${API_V1_PREFIX}/accountants`,
    listAccountantsHandler,
  );

  /**
   * One profile. Reads the caller's identity when a token is present but does
   * not require one, so a signed-out visitor gets the public view, not a 401.
   */
  app.get<{ Params: { uid: string } }>(
    `${API_V1_PREFIX}/accountants/:uid`,
    getAccountantHandler(deps),
  );

  app.post(
    `${API_V1_PREFIX}/accountants`,
    { preHandler: requireVerifiedToken(deps) },
    createAccountantHandler(latestExamPass),
  );

  app.patch(
    `${API_V1_PREFIX}/accountants/me`,
    { preHandler: requireAuth(deps) },
    updateOwnAccountantHandler,
  );

  app.get(
    `${API_V1_PREFIX}/accountants/me/uploads/photo`,
    { preHandler: requireAuth(deps) },
    presignPhotoDownloadHandler,
  );

  app.put(
    `${API_V1_PREFIX}/accountants/me/kyc`,
    { preHandler: requireAuth(deps) },
    submitKycHandler(cipher),
  );

  app.get<{ Params: { uid: string } }>(
    `${API_V1_PREFIX}/accountants/:uid/kyc`,
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    readKycHandler(cipher),
  );

  app.post<{ Params: { uid: string }; Body: { examScore?: number; examTotal?: number } }>(
    `${API_V1_PREFIX}/accountants/:uid/verify`,
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    verifyAccountantHandler,
  );
}
