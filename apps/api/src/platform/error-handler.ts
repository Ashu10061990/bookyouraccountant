import { ERROR_CODES } from "@bya/shared";
import type { FastifyError, FastifyInstance } from "fastify";
import { AppError } from "./errors.js";

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
    // "slow down". Map the status; never forward the plugin's message, which
    // can echo request content.
    const status = typeof error.statusCode === "number" ? error.statusCode : 500;
    let appError: AppError;
    if (error instanceof AppError) {
      appError = error;
    } else if (status === 429) {
      appError = new AppError(
        429,
        ERROR_CODES.RATE_LIMITED,
        "Too many requests. Please slow down.",
      );
    } else if (status >= 400 && status < 500) {
      appError = new AppError(status, ERROR_CODES.BAD_REQUEST, "Request could not be processed.");
    } else {
      appError = new AppError(500, ERROR_CODES.INTERNAL, "Something went wrong.");
    }

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

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: "Route not found.",
        requestId: request.id,
      },
    });
  });
}
