import type { FastifyReply, FastifyRequest } from "fastify";
import { tokenUidOf } from "../middlewares/auth.middleware.js";
import { parseBody } from "../middlewares/validate.middleware.js";
import {
  otpRequestSchema,
  otpVerifySchema,
  refreshTokenBodySchema,
} from "../schemas/auth.schema.js";
import {
  logout,
  refreshSession,
  requestOtp,
  verifyOtp,
  type AuthServiceDeps,
} from "../services/auth.service.js";

/**
 * Handlers for `/v1/auth/*`. Method, URL, preHandlers and the per-route rate
 * limits live in `routes/auth.routes.ts`.
 *
 * Handler factories (the `exams.controller.ts` pattern): the service needs
 * the notifier, the OTP/JWT config and a clock, all owned by the composition
 * root, so each handler closes over an injected `AuthServiceDeps`.
 */

export function requestOtpHandler(deps: AuthServiceDeps) {
  return async (request: FastifyRequest) => {
    const { phone } = parseBody(otpRequestSchema, request.body);
    return requestOtp(deps, phone);
  };
}

export function verifyOtpHandler(deps: AuthServiceDeps) {
  return async (request: FastifyRequest) => {
    const { phone, otp } = parseBody(otpVerifySchema, request.body);
    return verifyOtp(deps, phone, otp);
  };
}

export function refreshHandler(deps: AuthServiceDeps) {
  return async (request: FastifyRequest) => {
    const { refreshToken } = parseBody(refreshTokenBodySchema, request.body);
    return refreshSession(deps, refreshToken);
  };
}

export function logoutHandler(deps: AuthServiceDeps) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = parseBody(refreshTokenBodySchema, request.body);
    await logout(deps, tokenUidOf(request), refreshToken);
    return reply.status(204).send();
  };
}
