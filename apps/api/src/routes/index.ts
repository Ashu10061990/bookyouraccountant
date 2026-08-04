import type { FastifyInstance } from "fastify";
import { isConnected } from "../config/db.js";
import { type Env } from "../config/env.js";
import { type Cipher } from "../helpers/crypto.helper.js";
import { type AuthDeps } from "../integrations/token-verifier.js";
import { markVerifiedByExam } from "../repositories/accountants.repository.js";
import { latestPass as examLatestPass } from "../repositories/exams.repository.js";
import { AUDIT_ACTIONS, record as recordAudit } from "../services/audit.service.js";
import { type OnExamPass } from "../services/exams.service.js";
import { registerAccountantRoutes } from "./accountants.routes.js";
import { registerAuthRoutes } from "./auth.routes.js";
import { registerBusinessRoutes } from "./businesses.routes.js";
import { registerConfigRoutes } from "./config.routes.js";
import { registerExamRoutes } from "./exams.routes.js";
import { registerLeadRoutes } from "./leads.routes.js";
import { registerPaymentRoutes } from "./payments.routes.js";
import { registerServiceRoutes } from "./services.routes.js";
import { registerUploadRoutes } from "./uploads.routes.js";
import { registerUserRoutes } from "./users.routes.js";

/** Everything route registration needs from the composition root. */
export interface RouteDeps {
  env: Env;
  auth: AuthDeps;
  cipher: Cipher;
  /** Randomness for the exam draw. Production passes `Math.random`. */
  examRng: () => number;
  /** Current-time source for the exam throttle. */
  now: () => Date;
}

/**
 * Registers every domain's routes, plus the two meta routes (`/health`, `/`).
 * Route → controller → service → repository from here on; this file is the
 * only place that knows the full route surface.
 */
export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  // Collected from Fastify's own route table rather than hand-listed, so the
  // index at `/` cannot drift out of date as routes are added or renamed.
  // Registered before any route, since onRoute only fires for later ones.
  const routes: { method: string; url: string }[] = [];
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      // HEAD is auto-generated alongside every GET; listing both is noise.
      if (method !== "HEAD") routes.push({ method, url: route.url });
    }
  });

  /**
   * Liveness and readiness in one.
   *
   * This deliberately reports the database, and returns 503 when it is not
   * connected. The previous version returned `{ status: "ok" }` unconditionally
   * — so a server that had never opened a database connection looked perfectly
   * healthy to a load balancer, which would then route real traffic to it. It
   * was a check that could not fail, which is the same as no check.
   */
  app.get("/health", (_request, reply) => {
    const connected = isConnected();

    return reply.status(connected ? 200 : 503).send({
      status: connected ? "ok" : "degraded",
      database: connected ? "connected" : "disconnected",
    });
  });

  // Exam ⇄ accountants cross-wiring, done here at the composition seam so
  // neither module depends on the other:
  //  - passing the exam marks an existing accountant profile verified, audited,
  //    inside the submit transaction;
  //  - a profile created after passing is born verified, reading the pass from
  //    the server's own attempt record.
  const onExamPass: OnExamPass = async (uid, score, total, session) => {
    const changed = await markVerifiedByExam(uid, score, total, session);
    if (changed) {
      await recordAudit(
        {
          action: AUDIT_ACTIONS.ACCOUNTANT_VERIFY,
          actor: { uid, role: "accountant" },
          subjectType: "accountant",
          subjectId: uid,
          metadata: { via: "exam", score, total },
        },
        session,
      );
    }
  };

  // First-party auth. The notifier comes off the instance decoration —
  // `buildApp` decorates it before calling `registerRoutes`, and reading it
  // here keeps `RouteDeps` from growing a field only one registrar uses.
  registerAuthRoutes(app, deps.auth, {
    notifier: app.notifier,
    now: deps.now,
    config: {
      jwtSecret: deps.env.JWT_SECRET,
      otpTtlSec: deps.env.OTP_TTL_SEC,
      otpMaxAttempts: deps.env.OTP_MAX_ATTEMPTS,
      otpResendCooldownSec: deps.env.OTP_RESEND_COOLDOWN_SEC,
      devEchoOtp: deps.env.AUTH_DEV_ECHO_OTP,
    },
  });

  registerServiceRoutes(app, deps.auth);
  registerAccountantRoutes(app, deps.auth, deps.cipher, examLatestPass);
  registerBusinessRoutes(app, deps.auth, deps.cipher);
  registerUserRoutes(app, deps.auth);
  registerLeadRoutes(app, deps.auth);
  registerConfigRoutes(app, deps.auth);
  registerUploadRoutes(app, deps.auth);
  registerExamRoutes(app, deps.auth, {
    rng: deps.examRng,
    now: deps.now,
    onPass: onExamPass,
  });
  registerPaymentRoutes(app, deps.env);

  /**
   * A self-describing index, so hitting the root of the API tells you what it
   * serves instead of a bare 404.
   *
   * Public, like `/health`. It lists paths, not data — and every one of those
   * paths carries its own guard, so naming them grants nothing. Registered
   * last, so `routes` is fully populated by the time this closure runs.
   */
  app.get("/", () => ({
    name: "BookYourAccountant API",
    endpoints: [...routes].sort(
      (a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method),
    ),
  }));
}
