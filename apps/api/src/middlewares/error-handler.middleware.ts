import { ERROR_CODES, type ErrorCode } from "@bya/shared";
import type { FastifyError, FastifyInstance } from "fastify";
import { AppError } from "../errors/app-error.js";

/**
 * Maps an HTTP status to this project's stable error code.
 *
 * Needed because Fastify plugins (auth, rate limit, body parsing, schema
 * validation) throw errors that are not `AppError` but do carry a meaningful
 * status. Collapsing all of those to `BAD_REQUEST` — as this handler used to —
 * breaks the contract that clients branch on `code`, never on status: a client
 * could not distinguish "you are not signed in", which needs a login redirect,
 * from "your request was malformed", which must never trigger one.
 */
export function statusToCode(status: number): ErrorCode {
  switch (status) {
    case 401:
      return ERROR_CODES.UNAUTHENTICATED;
    case 403:
      return ERROR_CODES.FORBIDDEN;
    case 404:
      return ERROR_CODES.NOT_FOUND;
    case 409:
      return ERROR_CODES.CONFLICT;
    case 429:
      return ERROR_CODES.RATE_LIMITED;
    default:
      return status >= 400 && status < 500 ? ERROR_CODES.BAD_REQUEST : ERROR_CODES.INTERNAL;
  }
}

/** User-facing message per status. Never the plugin's own message. */
function messageForStatus(status: number): string {
  switch (status) {
    case 401:
      return "Sign in to continue.";
    case 403:
      return "You do not have access to this.";
    case 404:
      return "Not found.";
    case 409:
      return "That conflicts with the current state.";
    case 429:
      return "Too many requests. Please slow down.";
    default:
      return status >= 400 && status < 500
        ? "Request could not be processed."
        : "Something went wrong.";
  }
}

/**
 * The single error handler. Services throw; routes never catch.
 *
 * Unexpected errors become a generic 500 — the real cause goes to the log with
 * the requestId, never to the client.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Fastify plugins (rate limit, body parsing, validation) throw errors that
    // are not AppError but DO carry a meaningful 4xx statusCode. Collapsing
    // those to 500 would tell a rate-limited client "server broke" instead of
    // "slow down". Map the status to its stable code; never forward the
    // plugin's message, which can echo request content.
    const status = typeof error.statusCode === "number" ? error.statusCode : 500;
    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            status >= 400 && status < 600 ? status : 500,
            statusToCode(status),
            messageForStatus(status),
          );

    const level = appError.status >= 500 ? "error" : "warn";
    request.log[level](
      { err: error, code: appError.code, context: appError.context },
      "request failed",
    );

    void reply.status(appError.status).send({
      error: {
        code: appError.code,
        message: appError.message,
        requestId: request.id,
      },
    });
  });

  app.setNotFoundHandler({ preHandler: app.rateLimit() }, (request, reply) => {
    void reply.status(404).send({
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Route not found.",
        requestId: request.id,
      },
    });
  });
}
