import { ERROR_CODES, type ErrorCode } from "@bya/shared";

/**
 * The only error type services throw. Routes never catch — the single Fastify
 * error handler converts these into the wire format defined in @bya/shared.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, AppError);
  }
}

export function badRequest(message: string, code: ErrorCode = ERROR_CODES.BAD_REQUEST): AppError {
  return new AppError(400, code, message);
}

export function unauthenticated(message = "Sign in to continue."): AppError {
  return new AppError(401, ERROR_CODES.UNAUTHENTICATED, message);
}

export function forbidden(message = "You do not have access to this."): AppError {
  return new AppError(403, ERROR_CODES.FORBIDDEN, message);
}

export function notFound(message: string): AppError {
  return new AppError(404, ERROR_CODES.NOT_FOUND, message);
}

export function conflict(message: string, code: ErrorCode = ERROR_CODES.CONFLICT): AppError {
  return new AppError(409, code, message);
}
