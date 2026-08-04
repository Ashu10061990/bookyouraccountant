import type { FastifyInstance } from "fastify";
import { API_V1_PREFIX } from "../constants/index.js";
import {
  type ExamRouteDeps,
  startExamHandler,
  submitExamHandler,
} from "../controllers/exams.controller.js";
import { type AuthDeps, requireAuth, requireRole } from "../middlewares/auth.middleware.js";

export type { ExamRouteDeps } from "../controllers/exams.controller.js";

/**
 * HTTP surface for the qualifying exam.
 *
 * Both routes are accountant-only. There is deliberately **no** route that
 * returns a session or an answer key — the only thing a client ever receives is
 * a paper of shuffled public questions and, on submit, a score.
 */
export function registerExamRoutes(
  app: FastifyInstance,
  auth: AuthDeps,
  deps: ExamRouteDeps,
): void {
  app.post(
    `${API_V1_PREFIX}/exam/start`,
    { preHandler: [requireAuth(auth), requireRole("accountant")] },
    startExamHandler(deps),
  );

  app.post(
    `${API_V1_PREFIX}/exam/submit`,
    { preHandler: [requireAuth(auth), requireRole("accountant")] },
    submitExamHandler(deps),
  );
}
