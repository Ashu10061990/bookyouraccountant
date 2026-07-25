import { createAccountantSchema, kycSubmissionSchema, updateAccountantSchema } from "@bya/shared";
import type { FastifyInstance } from "fastify";
import {
  type AuthDeps,
  contextOf,
  requireAuth,
  requireRole,
  requireVerifiedToken,
  tokenUidOf,
} from "../../platform/auth.js";
import type { Cipher } from "../../platform/crypto.js";
import { parseBody } from "../../platform/validate.js";
import * as service from "./accountants.service.js";
import { publicView, viewFor } from "./accountants.serializers.js";

/**
 * HTTP surface for accountants.
 *
 * Every response goes through a serialiser. No route returns a repository
 * document directly — that is what makes "an endpoint physically cannot return
 * bank details to the wrong audience" (§6.5) true of the routing layer too, not
 * only of the serialisers in isolation.
 */
/** Resolves an accountant's server-confirmed exam pass. Injected from the
 * exams module so accountants does not depend on it directly. */
export type LatestExamPass = (uid: string) => Promise<{ score: number; total: number } | null>;

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
    "/v1/accountants",
    async (request) => {
      const { city, specialty, limit } = request.query;

      const accountants = await service.listVerified({
        city,
        specialty,
        limit: limit === undefined ? undefined : Number(limit),
      });

      return { accountants: accountants.map(publicView) };
    },
  );

  /**
   * One profile. The view depends on who is asking, resolved in one place.
   *
   * Reads the caller's identity when a token is present but does not require
   * one, so a signed-out visitor gets the public view rather than a 401.
   */
  app.get<{ Params: { uid: string } }>("/v1/accountants/:uid", async (request) => {
    const document = await service.getByUid(request.params.uid);

    let viewer: { uid: string; role: "business" | "accountant" | "admin" } | null = null;
    if (typeof request.headers.authorization === "string") {
      try {
        const verified = await deps.verifier.verify(
          request.headers.authorization.replace(/^Bearer /i, ""),
        );
        const user = await deps.userLookup(verified.uid);
        if (user !== null) viewer = { uid: verified.uid, role: user.role };
      } catch (error) {
        // An unusable token means "treat them as anonymous", not "fail". Logged
        // rather than swallowed — a spike here is a client sending stale tokens.
        request.log.warn({ err: error }, "ignoring unusable token on a public profile read");
      }
    }

    return { accountant: viewFor(document, viewer) };
  });

  app.post(
    "/v1/accountants",
    { preHandler: requireVerifiedToken(deps) },
    async (request, reply) => {
      // Identity from the token; the body cannot name a different accountant.
      const input = parseBody(createAccountantSchema, request.body);
      const ctx = { uid: tokenUidOf(request), role: "accountant" as const, blocked: false };

      // A profile created after passing the exam is born verified — the pass is
      // read from the server's own record, never from the request.
      const examPass = latestExamPass === undefined ? null : await latestExamPass(ctx.uid);
      const created = await service.createProfile(ctx, input, request.body, examPass);

      return reply.status(201).send({ accountant: viewFor(created, ctx) });
    },
  );

  app.patch("/v1/accountants/me", { preHandler: requireAuth(deps) }, async (request) => {
    const ctx = contextOf(request);
    const changes = parseBody(updateAccountantSchema, request.body);
    const updated = await service.updateOwnProfile(ctx, changes, request.body);

    return { accountant: viewFor(updated, ctx) };
  });

  /**
   * A short-lived presigned GET for the caller's own stored profile photo.
   *
   * No `:uid` param — always "my own photo" — so there is nothing here for a
   * caller to point at someone else's key; `service.presignPhotoDownload`
   * loads the document by `ctx.uid` alone. 404s when no photo has been set.
   */
  app.get(
    "/v1/accountants/me/uploads/photo",
    { preHandler: requireAuth(deps) },
    async (request) => ({
      url: await service.presignPhotoDownload(request.server.storage, contextOf(request)),
    }),
  );

  /** KYC in: plaintext over TLS, sealed server-side, masked in the response. */
  app.put("/v1/accountants/me/kyc", { preHandler: requireAuth(deps) }, async (request) => {
    const ctx = contextOf(request);
    const input = parseBody(kycSubmissionSchema, request.body);
    const updated = await service.submitKyc(ctx, input, cipher);

    return { accountant: viewFor(updated, ctx) };
  });

  /**
   * Full KYC, decrypted. Admin only, and audited before the value is returned.
   *
   * Separate from the profile route on purpose: reading a PAN should be an
   * explicit act with its own URL and its own audit entry, never a side effect
   * of fetching a profile.
   */
  app.get<{ Params: { uid: string } }>(
    "/v1/accountants/:uid/kyc",
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    async (request) => ({
      kyc: await service.readKycPlaintext(contextOf(request), request.params.uid, cipher),
    }),
  );

  app.post<{ Params: { uid: string }; Body: { examScore?: number; examTotal?: number } }>(
    "/v1/accountants/:uid/verify",
    { preHandler: [requireAuth(deps), requireRole("admin")] },
    async (request) => {
      const ctx = contextOf(request);
      const { examScore = 0, examTotal = 0 } = request.body ?? {};
      const verified = await service.verifyAccountant(
        ctx,
        request.params.uid,
        examScore,
        examTotal,
      );

      return { accountant: viewFor(verified, ctx) };
    },
  );
}
