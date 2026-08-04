import { examSubmissionSchema } from "@bya/shared";
import type { FastifyRequest } from "fastify";
import type { Rng } from "../helpers/exam-engine.helper.js";
import { contextOf } from "../middlewares/auth.middleware.js";
import { parseBody } from "../middlewares/validate.middleware.js";
import { type OnExamPass, startExam, submitExam } from "../services/exams.service.js";

/**
 * Handlers for the qualifying exam. Method, URL and preHandlers live in
 * `routes/exams.routes.ts`.
 *
 * There is deliberately **no** handler that returns a session or an answer key
 * — the only thing a client ever receives is a paper of shuffled public
 * questions and, on submit, a score.
 */

export interface ExamRouteDeps {
  /** Randomness for the draw. Production passes `Math.random`. */
  rng: Rng;
  /** Current time, injected so the throttle window is testable. */
  now: () => Date;
  /** Called on a passing attempt — wired to mark the accountant verified. */
  onPass?: OnExamPass;
}

export function startExamHandler(deps: ExamRouteDeps) {
  return async (request: FastifyRequest) => {
    const paper = await startExam(contextOf(request), deps.rng, deps.now());
    return { exam: paper };
  };
}

export function submitExamHandler(deps: ExamRouteDeps) {
  return async (request: FastifyRequest) => {
    const submission = parseBody(examSubmissionSchema, request.body);
    const result = await submitExam(contextOf(request), submission, deps.now(), deps.onPass);
    return { result };
  };
}
