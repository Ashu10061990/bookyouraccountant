import { ERROR_CODES } from "@bya/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "./errors.js";

/**
 * The single error handler. Services throw; routes never catch.
 *
 * Unexpected errors become a generic 500 — the real cause goes to the log with
 * the requestId, never to the client.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(500, ERROR_CODES.INTERNAL, "Something went wrong.");

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
