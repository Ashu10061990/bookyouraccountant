import { examSubmissionSchema } from "@bya/shared";
import type { FastifyInstance } from "fastify";
import { type AuthDeps, contextOf, requireAuth, requireRole } from "../../platform/auth.js";
import { parseBody } from "../../platform/validate.js";
import type { Rng } from "./exam-engine.js";
import { type OnExamPass, startExam, submitExam } from "./exams.service.js";

export interface ExamRouteDeps {
  /** Randomness for the draw. Production passes `Math.random`. */
  rng: Rng;
  /** Current time, injected so the throttle window is testable. */
  now: () => Date;
  /** Called on a passing attempt — wired to mark the accountant verified. */
  onPass?: OnExamPass;
}

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
    "/v1/exam/start",
    { preHandler: [requireAuth(auth), requireRole("accountant")] },
    async (request) => {
      const paper = await startExam(contextOf(request), deps.rng, deps.now());
      return { exam: paper };
    },
  );

  app.post(
    "/v1/exam/submit",
    { preHandler: [requireAuth(auth), requireRole("accountant")] },
    async (request) => {
      const submission = parseBody(examSubmissionSchema, request.body);
      const result = await submitExam(contextOf(request), submission, deps.now(), deps.onPass);
      return { result };
    },
  );
}
