import { createAccountantSchema, kycSubmissionSchema, updateAccountantSchema } from "@bya/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { publicView, viewFor } from "../helpers/accountants.serializer.js";
import type { Cipher } from "../helpers/crypto.helper.js";
import type { AuthDeps } from "../integrations/token-verifier.js";
import { contextOf, tokenUidOf } from "../middlewares/auth.middleware.js";
import { parseBody } from "../middlewares/validate.middleware.js";
import * as service from "../services/accountants.service.js";

/**
 * Handlers for accountants. Method, URL and preHandlers live in
 * `routes/accountants.routes.ts`.
 *
 * Every response goes through a serialiser. No handler returns a repository
 * document directly — that is what makes "an endpoint physically cannot return
 * bank details to the wrong audience" (§6.5) true of the routing layer too, not
 * only of the serialisers in isolation.
 */

/** Resolves an accountant's server-confirmed exam pass. Injected from the
 * exams module so accountants does not depend on it directly. */
export type LatestExamPass = (uid: string) => Promise<{ score: number; total: number } | null>;

/** The public marketplace listing — see the route file for why it is public. */
export async function listAccountantsHandler(
  request: FastifyRequest<{ Querystring: { city?: string; specialty?: string; limit?: string } }>,
) {
  const { city, specialty, limit } = request.query;

  const accountants = await service.listVerified({
    city,
    specialty,
    limit: limit === undefined ? undefined : Number(limit),
  });

  return { accountants: accountants.map(publicView) };
}

/**
 * One profile. The view depends on who is asking, resolved in one place.
 *
 * Reads the caller's identity when a token is present but does not require
 * one, so a signed-out visitor gets the public view rather than a 401.
 */
export function getAccountantHandler(deps: AuthDeps) {
  return async (request: FastifyRequest<{ Params: { uid: string } }>) => {
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
  };
}

export function createAccountantHandler(latestExamPass?: LatestExamPass) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Identity from the token; the body cannot name a different accountant.
    const input = parseBody(createAccountantSchema, request.body);
    const ctx = { uid: tokenUidOf(request), role: "accountant" as const, blocked: false };

    // A profile created after passing the exam is born verified — the pass is
    // read from the server's own record, never from the request.
    const examPass = latestExamPass === undefined ? null : await latestExamPass(ctx.uid);
    const created = await service.createProfile(
      ctx,
      input,
      request.body,
      examPass,
      request.server.notifier,
    );

    return reply.status(201).send({ accountant: viewFor(created, ctx) });
  };
}

export async function updateOwnAccountantHandler(request: FastifyRequest) {
  const ctx = contextOf(request);
  const changes = parseBody(updateAccountantSchema, request.body);
  const updated = await service.updateOwnProfile(ctx, changes, request.body);

  return { accountant: viewFor(updated, ctx) };
}

/**
 * A short-lived presigned GET for the caller's own stored profile photo.
 *
 * No `:uid` param — always "my own photo" — so there is nothing here for a
 * caller to point at someone else's key; `service.presignPhotoDownload`
 * loads the document by `ctx.uid` alone. 404s when no photo has been set.
 */
export async function presignPhotoDownloadHandler(request: FastifyRequest) {
  return {
    url: await service.presignPhotoDownload(request.server.storage, contextOf(request)),
  };
}

/** KYC in: plaintext over TLS, sealed server-side, masked in the response. */
export function submitKycHandler(cipher: Cipher) {
  return async (request: FastifyRequest) => {
    const ctx = contextOf(request);
    const input = parseBody(kycSubmissionSchema, request.body);
    const updated = await service.submitKyc(ctx, input, cipher);

    return { accountant: viewFor(updated, ctx) };
  };
}

/**
 * Full KYC, decrypted. Admin only, and audited before the value is returned.
 *
 * Separate from the profile handler on purpose: reading a PAN should be an
 * explicit act with its own URL and its own audit entry, never a side effect
 * of fetching a profile.
 */
export function readKycHandler(cipher: Cipher) {
  return async (request: FastifyRequest<{ Params: { uid: string } }>) => ({
    kyc: await service.readKycPlaintext(contextOf(request), request.params.uid, cipher),
  });
}

export async function verifyAccountantHandler(
  request: FastifyRequest<{
    Params: { uid: string };
    Body: { examScore?: number; examTotal?: number };
  }>,
) {
  const ctx = contextOf(request);
  const { examScore = 0, examTotal = 0 } = request.body ?? {};
  const verified = await service.verifyAccountant(
    ctx,
    request.params.uid,
    examScore,
    examTotal,
    request.server.notifier,
  );

  return { accountant: viewFor(verified, ctx) };
}
