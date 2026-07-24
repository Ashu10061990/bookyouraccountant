# Accountant Onboarding + Exam Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real, clickable browser journey in `apps/app` — phone-OTP sign-in → 20-question qualifying exam → register profile → verified accountant — wired to the existing tested API.

**Architecture:** The Vite SPA gains Firebase **client** auth and a typed REST client to the Fastify API. The backend already implements the whole journey; the only server change is a gated no-key dev token-verifier so real Firebase tokens verify locally without a service-account key. Verification uses an optional Firebase Auth **emulator** seam so the full flow can be walked locally. Design rationale lives in `docs/specs/2026-07-24-accountant-onboarding-slice-design.md`.

**Tech Stack:** React 19 + React Router 7 + TanStack Query 5 (already deps), Tailwind + `@bya/ui` tokens, Firebase Web SDK v11 (new dep), Fastify + Mongoose + Firebase Admin (existing API), Vitest (API tests only).

## Global Constraints

Copied verbatim from CLAUDE.md — every task implicitly includes these:

- **Import extensions differ by package.** `apps/api` and `packages/shared` are `NodeNext` — relative imports need the `.js` extension. `apps/app` is Vite with `moduleResolution: "Bundler"` — relative imports use the `.js` specifier too (see `main.tsx` importing `"./App.js"`). Match the sibling file.
- **`@bya/shared` resolves to `dist/`, not `src/`.** After editing a shared file, run `pnpm --filter @bya/shared build` (or `pnpm test` from root, which builds first) before API tests exercise it. This slice does **not** edit `@bya/shared`.
- TypeScript `strict`; base tsconfig also sets `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — array access is `T | undefined` (guard it), and optional props must be exactly-typed. No unjustified `any`.
- Files < ~300 lines, services < ~200.
- **No silent catch** — every catch is handled, rethrown, or logged. A `catch {}` or `catch { /* comment */ }` fails lint.
- Repositories are the only Mongoose importers (API side).
- Conventional Commits. **Never `--no-verify`, never `eslint-disable`** — fix the code.
- `apps/app` and `apps/web` have **no `test` script** — deliberate. Do not add one. SPA verification is in the browser.
- Ports: API `8080`, SPA `5173`, Web `3000`. Firebase Auth emulator: `9099`.
- Firebase project id: `accountant-on-call` (public web config is in the frozen legacy bundle and safe to embed).

---

## File Structure

**API (modify):**

- `apps/api/src/platform/env.ts` — add `FIREBASE_ALLOW_UNREVOKED_CHECK`; boot refusal under production.
- `apps/api/src/platform/auth.ts` — `firebaseVerifier(projectId?, { checkRevoked })`.
- `apps/api/src/app.ts` — pass `checkRevoked` from env into the default verifier.
- `apps/api/src/test/env.ts` — add the new field to the test env literal.
- `apps/api/.env`, `apps/api/.env.example` — document + set the dev flag and project id.
- `apps/api/src/platform/env.test.ts` — new: the flag + boot-refusal (create if absent).
- `apps/api/src/platform/auth.verifier.test.ts` — new: the verifier's option decision.
- `apps/api/src/modules/onboarding.e2e.test.ts` — new: the whole backend journey.

**SPA (create in `apps/app/src` unless noted):**

- `lib/firebase-config.ts` — public web config + `import.meta.env` overrides.
- `lib/firebase.ts` — app + auth init; optional emulator connect.
- `lib/api.ts` — typed fetch client + `ApiError`.
- `lib/auth-context.tsx` — `AuthProvider` + `useAuth`.
- `lib/queries.ts` — React Query hooks/mutations.
- `components/ui.tsx` — Panel, Field, TextInput, Select, MultiSelect, Pill, StepIndicator, Spinner, ErrorNote.
- `components/TimerRing.tsx` — the exam countdown ring.
- `routes/Landing.tsx`, `routes/SignIn.tsx`, `routes/RequireAuth.tsx`.
- `routes/onboarding/Onboarding.tsx`, `routes/onboarding/ExamStep.tsx`, `routes/onboarding/LiveExam.tsx`, `routes/onboarding/ExamResult.tsx`, `routes/onboarding/ProfileStep.tsx`.
- `routes/Accountant.tsx`.
- Modify `src/App.tsx` (route table), `src/main.tsx` (wrap in `AuthProvider`).
- `apps/app/package.json` — add `firebase`.
- `apps/app/.env.example` — SPA env template.
- `firebase.json` (repo root) — emulator config.

---

## Task 1: API — gated no-key dev verifier

**Files:**

- Modify: `apps/api/src/platform/env.ts`
- Modify: `apps/api/src/platform/auth.ts:209-229`
- Modify: `apps/api/src/app.ts:118-121`
- Modify: `apps/api/src/test/env.ts`
- Create: `apps/api/src/platform/env.test.ts`
- Create: `apps/api/src/platform/auth.verifier.test.ts`

**Interfaces:**

- Produces: `firebaseVerifier(projectId?: string, opts?: { checkRevoked?: boolean }): TokenVerifier`; `Env.FIREBASE_ALLOW_UNREVOKED_CHECK: boolean`.
- Consumes: existing `TokenVerifier`, `loadEnv`, `testEnv`.

- [ ] **Step 1: Write the failing env test**

Create `apps/api/src/platform/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = {
  MONGODB_URI: "mongodb://127.0.0.1:27017/bya-test",
  ALLOWED_ORIGINS: "http://localhost:5173",
};

describe("FIREBASE_ALLOW_UNREVOKED_CHECK", () => {
  it("defaults to false", () => {
    expect(loadEnv({ ...base }).FIREBASE_ALLOW_UNREVOKED_CHECK).toBe(false);
  });

  it("parses the string 'true' to boolean true in development", () => {
    const env = loadEnv({
      ...base,
      NODE_ENV: "development",
      FIREBASE_ALLOW_UNREVOKED_CHECK: "true",
    });
    expect(env.FIREBASE_ALLOW_UNREVOKED_CHECK).toBe(true);
  });

  it("rejects a non-boolean string loudly", () => {
    expect(() => loadEnv({ ...base, FIREBASE_ALLOW_UNREVOKED_CHECK: "yes" })).toThrow(
      /FIREBASE_ALLOW_UNREVOKED_CHECK/,
    );
  });

  it("REFUSES to boot when true under NODE_ENV=production", () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: "production", FIREBASE_ALLOW_UNREVOKED_CHECK: "true" }),
    ).toThrow(/must not be true when NODE_ENV=production/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @bya/api test -- env.test`
Expected: FAIL — `FIREBASE_ALLOW_UNREVOKED_CHECK` is `undefined` / not in the schema.

- [ ] **Step 3: Add the field + boot refusal to `env.ts`**

In `apps/api/src/platform/env.ts`, add this field inside the `z.object({ … })` (next to `FIREBASE_PROJECT_ID`):

```ts
  /**
   * DEV-ONLY. Verify tokens with `checkRevoked: false`, so the API accepts real
   * Firebase tokens using Google's public certs with no service-account key.
   * The only cost: a signed-out token stays valid until it expires (≤1h). The
   * object-level refine below refuses to boot if this is true in production.
   */
  FIREBASE_ALLOW_UNREVOKED_CHECK: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
```

Then change the schema definition so the object is refined. Replace `const envSchema = z.object({` … `});` closing with a `.superRefine` that keeps listing every problem:

```ts
const envSchema = z
  .object({/* …all existing fields, including the new one above… */})
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.FIREBASE_ALLOW_UNREVOKED_CHECK) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FIREBASE_ALLOW_UNREVOKED_CHECK"],
        message:
          "FIREBASE_ALLOW_UNREVOKED_CHECK must not be true when NODE_ENV=production — " +
          "the no-key dev verifier skips revocation checks and must never run in production.",
      });
    }
  });
```

(`z.infer` still yields the same `Env` type; the transform makes the field a `boolean`.)

- [ ] **Step 4: Add the field to the test env literal**

In `apps/api/src/test/env.ts`, add to the returned literal (before `...overrides`):

```ts
    FIREBASE_ALLOW_UNREVOKED_CHECK: false,
```

- [ ] **Step 5: Run the env test — expect PASS**

Run: `pnpm --filter @bya/api test -- env.test`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing verifier test**

Create `apps/api/src/platform/auth.verifier.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { firebaseVerifier } from "./auth.js";

// We assert the DECISION the verifier makes (projectId-only init + checkRevoked
// flag), by spying on firebase-admin. We never hit the network.
describe("firebaseVerifier option decision", () => {
  it("defaults to checkRevoked: true and a credentialed init", async () => {
    const initializeApp = vi.fn();
    const verifyIdToken = vi.fn().mockResolvedValue({ uid: "u1" });
    vi.doMock("firebase-admin/app", () => ({
      getApps: () => [],
      initializeApp,
      applicationDefault: () => ({ __adc: true }),
    }));
    vi.doMock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken }) }));

    const { firebaseVerifier: fresh } = await import("./auth.js");
    await fresh("proj-1").verify("tok");

    expect(initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ credential: { __adc: true }, projectId: "proj-1" }),
    );
    expect(verifyIdToken).toHaveBeenCalledWith("tok", true);
    vi.resetModules();
    vi.doUnmock("firebase-admin/app");
    vi.doUnmock("firebase-admin/auth");
  });

  it("with checkRevoked:false inits projectId-only (no credential) and skips revocation", async () => {
    const initializeApp = vi.fn();
    const verifyIdToken = vi.fn().mockResolvedValue({ uid: "u2" });
    vi.doMock("firebase-admin/app", () => ({
      getApps: () => [],
      initializeApp,
      applicationDefault: () => ({ __adc: true }),
    }));
    vi.doMock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken }) }));

    const { firebaseVerifier: fresh } = await import("./auth.js");
    await fresh("proj-2", { checkRevoked: false }).verify("tok");

    expect(initializeApp).toHaveBeenCalledWith({ projectId: "proj-2" });
    expect(verifyIdToken).toHaveBeenCalledWith("tok", false);
    vi.resetModules();
    vi.doUnmock("firebase-admin/app");
    vi.doUnmock("firebase-admin/auth");
  });
});
```

Note the reference to `firebaseVerifier` marks it a required export. Keep the top-level import so a rename breaks the build, and re-import after `doMock` to pick up the mocks.

- [ ] **Step 7: Run it — expect FAIL**

Run: `pnpm --filter @bya/api test -- auth.verifier`
Expected: FAIL — current `firebaseVerifier` ignores a second arg and always passes `true`.

- [ ] **Step 8: Implement the verifier option**

Replace the body of `firebaseVerifier` in `apps/api/src/platform/auth.ts` (lines ~209-229) with:

```ts
export function firebaseVerifier(
  projectId?: string,
  opts: { checkRevoked?: boolean } = {},
): TokenVerifier {
  const checkRevoked = opts.checkRevoked ?? true;

  return {
    async verify(idToken: string): Promise<VerifiedToken> {
      const { getApps, initializeApp, applicationDefault } = await import("firebase-admin/app");
      const { getAuth } = await import("firebase-admin/auth");

      if (getApps().length === 0) {
        // With revocation checking we call the Auth backend, which needs real
        // credentials (Application Default Credentials). Without it — the gated
        // dev path — a projectId is enough to verify a token's signature against
        // Google's public certs and validate its audience/issuer, no key needed.
        initializeApp(
          checkRevoked
            ? {
                credential: applicationDefault(),
                ...(projectId === undefined ? {} : { projectId }),
              }
            : { ...(projectId === undefined ? {} : { projectId }) },
        );
      }

      const decoded = await getAuth().verifyIdToken(idToken, checkRevoked);
      return { uid: decoded.uid, claims: { ...decoded } };
    },
  };
}
```

- [ ] **Step 9: Wire the flag in `app.ts`**

In `apps/api/src/app.ts`, change the default `auth` (lines ~118-121) to:

```ts
const auth: AuthDeps = options.auth ?? {
  verifier: firebaseVerifier(env.FIREBASE_PROJECT_ID, {
    checkRevoked: !env.FIREBASE_ALLOW_UNREVOKED_CHECK,
  }),
  userLookup: findAuthUser,
};
```

- [ ] **Step 10: Run the verifier test + full API suite**

Run: `pnpm --filter @bya/api test -- auth.verifier` → PASS (2).
Run: `pnpm --filter @bya/api test` → all green (existing 330 + new).

- [ ] **Step 11: Update `.env` and `.env.example`**

In `apps/api/.env`, uncomment/set:

```
FIREBASE_PROJECT_ID=accountant-on-call
FIREBASE_ALLOW_UNREVOKED_CHECK=true
```

In `apps/api/.env.example`, document the flag (no value that turns it on):

```
# DEV ONLY. Verify real Firebase tokens without a service-account key, by
# skipping the revocation check (checkRevoked:false). Boot REFUSES this under
# NODE_ENV=production. Leave unset (defaults false) unless developing locally.
# FIREBASE_ALLOW_UNREVOKED_CHECK=true
```

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/platform/env.ts apps/api/src/platform/auth.ts apps/api/src/app.ts \
        apps/api/src/test/env.ts apps/api/src/platform/env.test.ts \
        apps/api/src/platform/auth.verifier.test.ts apps/api/.env.example
git commit -m "feat(api): gated no-key dev token verifier, refused in production"
```

(`.env` is gitignored — not staged.)

---

## Task 2: API — end-to-end onboarding integration test

Proves the whole backend journey the SPA will drive, deterministically, with no Firebase. This is the safety net behind the browser walkthrough.

**Files:**

- Create: `apps/api/src/modules/onboarding.e2e.test.ts`

**Interfaces:**

- Consumes: `buildTestApp`, `TOKENS`, `UIDS`, `as` (`src/test/app.js`); `startTestMongo/clearTestMongo/stopTestMongo` (`src/test/mongo.js`); `assertIndexes` (`platform/db.js`); `seededRng` (`modules/exams/exam-engine.js`); `ExamSessionModel` (`modules/exams/exams.schema.js`); `AccountantModel` (`modules/accountants/accountants.schema.js`).

- [ ] **Step 1: Write the end-to-end test**

Create `apps/api/src/modules/onboarding.e2e.test.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../platform/db.js";
import { seededRng } from "./exams/exam-engine.js";
import { ExamSessionModel } from "./exams/exams.schema.js";
import { TOKENS, UIDS, as, buildTestApp } from "../test/app.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";

let app: FastifyInstance;
const clock = new Date("2026-07-24T00:00:00Z");

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();
  // No pre-seeded users: this test bootstraps its own accountant, exactly as
  // the SPA will after OTP.
  app = await buildTestApp({}, undefined, { examRng: seededRng(7), now: () => clock });
}, 60_000);

afterAll(async () => {
  await app.close();
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
});

/** Reads the stored key so the test can submit a genuine pass — the same
 * white-box trick the exam suite uses; no client can do this. */
async function correctAnswersFor(sessionId: string): Promise<number[]> {
  const session = await ExamSessionModel.findById(sessionId).lean();
  return [...session!.answerKey];
}

describe("accountant onboarding — the whole journey the SPA drives", () => {
  it("bootstrap → exam pass → register → born verified", async () => {
    // 1. Bootstrap the user record (role gate for the exam). The SPA does this
    //    right after OTP; a 409 on a repeat is treated as success there.
    const bootstrap = await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: as(TOKENS.accountant),
      payload: { role: "accountant", phone: "+919876543210" },
    });
    expect(bootstrap.statusCode).toBe(201);

    // 2. Start the exam (requires the accountant role from step 1).
    const start = await app.inject({
      method: "POST",
      url: "/v1/exam/start",
      headers: as(TOKENS.accountant),
    });
    expect(start.statusCode).toBe(200);
    const { sessionId } = start.json<{ exam: { sessionId: string } }>().exam;

    // 3. Submit a genuinely correct paper → pass. The server records the pass.
    const answers = await correctAnswersFor(sessionId);
    const submit = await app.inject({
      method: "POST",
      url: "/v1/exam/submit",
      headers: as(TOKENS.accountant),
      payload: { sessionId, answers },
    });
    expect(submit.json()).toMatchObject({ result: { passed: true, total: 20 } });

    // 4. Register the profile. No `verified` in the body — the server reads the
    //    recorded pass and mints it verified.
    const register = await app.inject({
      method: "POST",
      url: "/v1/accountants",
      headers: as(TOKENS.accountant),
      payload: {
        name: "Asha Rao",
        city: "Kochi",
        state: "Kerala",
        qualifications: ["ca"],
        experienceYears: 8,
        specialties: ["gst"],
        languages: ["english"],
        accountingSoftware: [],
        complianceSoftware: [],
      },
    });
    expect(register.statusCode).toBe(201);
    expect(register.json()).toMatchObject({ accountant: { verified: true } });

    // 5. The terminal read the SPA lands on: owner sees the private view.
    const me = await app.inject({
      method: "GET",
      url: `/v1/accountants/${UIDS.accountant}`,
      headers: as(TOKENS.accountant),
    });
    const view = me.json<{ accountant: { verified: boolean; examScore: number } }>().accountant;
    expect(view.verified).toBe(true);
    expect(view.examScore).toBe(20);
  });

  it("refuses to start the exam before the user is bootstrapped (401)", async () => {
    const start = await app.inject({
      method: "POST",
      url: "/v1/exam/start",
      headers: as(TOKENS.accountant),
    });
    expect(start.statusCode).toBe(401);
  });

  it("rejects a client-forged `verified: true` on registration", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/users",
      headers: as(TOKENS.accountant),
      payload: { role: "accountant" },
    });
    const register = await app.inject({
      method: "POST",
      url: "/v1/accountants",
      headers: as(TOKENS.accountant),
      payload: {
        name: "Forger",
        city: "X",
        state: "Y",
        qualifications: ["ca"],
        experienceYears: 1,
        specialties: ["gst"],
        languages: ["english"],
        accountingSoftware: [],
        complianceSoftware: [],
        verified: true,
      },
    });
    expect(register.statusCode).toBe(403);
  });
});
```

- [ ] **Step 2: Run it — expect PASS**

Run: `pnpm --filter @bya/api test -- onboarding.e2e`
Expected: PASS (3). If the "bootstrap→register" test fails on the born-verified assertion, confirm `@bya/shared` is built (`pnpm --filter @bya/shared build`) — the API imports its `dist/`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/onboarding.e2e.test.ts
git commit -m "test(api): end-to-end onboarding journey — bootstrap to born-verified"
```

---

## Task 3: SPA foundation — Firebase client, API client, auth context, emulator seam

**Files:**

- Modify: `apps/app/package.json` (add `firebase`)
- Create: `apps/app/src/lib/firebase-config.ts`, `apps/app/src/lib/firebase.ts`, `apps/app/src/lib/api.ts`, `apps/app/src/lib/auth-context.tsx`, `apps/app/src/lib/queries.ts`
- Create: `apps/app/.env.example`, `firebase.json` (repo root)

**Interfaces:**

- Produces: `auth`, `usingEmulator` (`firebase.ts`); `api`, `ApiError` (`api.ts`); `AuthProvider`, `useAuth(): { user, loading, signOut, getToken }` (`auth-context.tsx`); `useMe`, `useAccountant`, `bootstrapUser`, `startExam`, `submitExam`, `createProfile` (`queries.ts`).

- [ ] **Step 1: Add the Firebase dependency**

```bash
pnpm --filter @bya/app add firebase@^11.1.0
```

Expected: `firebase` appears under `dependencies` in `apps/app/package.json`; lockfile updates.

- [ ] **Step 2: Write the public Firebase config**

Create `apps/app/src/lib/firebase-config.ts`:

```ts
/**
 * The Firebase **web** config. Public by design — it ships in every client
 * bundle and identifies the project; it is not a secret. Carried over from the
 * frozen legacy app (`BYA& Keiri/bya-new/src/lib/firebaseConfig.js`).
 *
 * `import.meta.env` overrides let a different project be pointed at without a
 * code change; unset, it uses the live `accountant-on-call` project.
 */
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyABTTk9wOfsxHysOoCe4omD4zO-R22OS2k",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "accountant-on-call.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "accountant-on-call",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "accountant-on-call.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "450646620629",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:450646620629:web:523e811a3aee110af7e55c",
};

/** Host:port of a running Auth emulator, e.g. `127.0.0.1:9099`. Unset ⇒ real project. */
export const authEmulatorHost = env.VITE_FIREBASE_AUTH_EMULATOR_HOST as string | undefined;
```

- [ ] **Step 3: Initialise Firebase (with the emulator seam)**

Create `apps/app/src/lib/firebase.ts`:

```ts
import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from "firebase/auth";
import { authEmulatorHost, firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

/** True when pointed at a local Auth emulator — real project untouched. */
export const usingEmulator = authEmulatorHost !== undefined;

if (usingEmulator) {
  connectAuthEmulator(auth, `http://${authEmulatorHost}`, { disableWarnings: true });
  // The emulator has no reCAPTCHA; let phone sign-in skip app verification.
  auth.settings.appVerificationDisabledForTesting = true;
}

// Durable across reloads; a slow write must never block sign-in, so failures
// are logged, not thrown (no silent catch).
setPersistence(auth, browserLocalPersistence).catch((error: unknown) => {
  console.warn("auth persistence init failed:", error);
});
```

- [ ] **Step 4: Write the typed API client**

Create `apps/app/src/lib/api.ts`:

```ts
import { auth } from "./firebase.js";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8080";

/** A structured API error, carrying the server's stable `code` so callers can
 * branch (e.g. treat CONFLICT on bootstrap as success). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

async function request<T>(method: string, path: string, body?: unknown, authed = true): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };

  if (authed) {
    const user = auth.currentUser;
    if (user === null) throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
    headers.authorization = `Bearer ${await user.getIdToken()}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    throw new ApiError(0, "NETWORK", "Can't reach the server. Is the API running on :8080?");
  }

  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(
      response.status,
      parsed.error?.code ?? "UNKNOWN",
      parsed.error?.message ?? `Request failed (${String(response.status)}).`,
    );
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, authed = true): Promise<T> => request<T>("GET", path, undefined, authed),
  post: <T>(path: string, body?: unknown, authed = true): Promise<T> =>
    request<T>("POST", path, body, authed),
};
```

- [ ] **Step 5: Write the auth context**

Create `apps/app/src/lib/auth-context.tsx`:

```tsx
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { auth } from "./firebase.js";

interface AuthValue {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signOut: () => fbSignOut(auth),
      getToken: () =>
        auth.currentUser === null ? Promise.resolve(null) : auth.currentUser.getIdToken(),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
```

- [ ] **Step 6: Write the query hooks**

Create `apps/app/src/lib/queries.ts`:

```ts
import type { CreateAccountantInput, ExamPaper, ExamResult, ExamSubmission } from "@bya/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api, ApiError } from "./api.js";

interface AccountantView {
  firebaseUid: string;
  name: string;
  city: string;
  state: string;
  qualifications: string[];
  specialties: string[];
  languages: string[];
  experienceYears: number;
  verified: boolean;
  examScore?: number;
  examTotal?: number;
}

/** Bootstraps the caller's user record. A 409 means it already exists — which
 * is success for our purposes (the identity is set up). */
export async function bootstrapUser(phone?: string): Promise<void> {
  try {
    await api.post("/v1/users", { role: "accountant", ...(phone === undefined ? {} : { phone }) });
  } catch (error) {
    if (error instanceof ApiError && error.code === "CONFLICT") return;
    throw error;
  }
}

export const startExam = (): Promise<ExamPaper> =>
  api.post<{ exam: ExamPaper }>("/v1/exam/start").then((r) => r.exam);

export const submitExam = (submission: ExamSubmission): Promise<ExamResult> =>
  api.post<{ result: ExamResult }>("/v1/exam/submit", submission).then((r) => r.result);

export const createProfile = (input: CreateAccountantInput): Promise<AccountantView> =>
  api.post<{ accountant: AccountantView }>("/v1/accountants", input).then((r) => r.accountant);

/** The current accountant's own profile, or null if none exists yet (404). */
export function useAccountant(uid: string | undefined): UseQueryResult<AccountantView | null> {
  return useQuery({
    queryKey: ["accountant", uid],
    enabled: uid !== undefined,
    queryFn: async (): Promise<AccountantView | null> => {
      try {
        const r = await api.get<{ accountant: AccountantView }>(`/v1/accountants/${uid ?? ""}`);
        return r.accountant;
      } catch (error) {
        if (error instanceof ApiError && error.code === "NOT_FOUND") return null;
        throw error;
      }
    },
  });
}

export type { AccountantView };
```

- [ ] **Step 7: Write the SPA env template + emulator config**

Create `apps/app/.env.example`:

```
# SPA environment. Copy to `.env.local` (gitignored) and adjust.
# The API base. Defaults to http://localhost:8080 if unset.
VITE_API_BASE_URL=http://localhost:8080

# LOCAL E2E ONLY. Point auth at a Firebase Auth emulator so the full OTP flow
# runs with no console/SMS. Unset ⇒ the real accountant-on-call project.
# VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

Create `firebase.json` (repo root):

```json
{
  "emulators": {
    "auth": { "host": "127.0.0.1", "port": 9099 },
    "ui": { "enabled": true }
  }
}
```

- [ ] **Step 8: Typecheck + lint the foundation**

Run: `pnpm --filter @bya/app typecheck && pnpm --filter @bya/app lint`
Expected: clean. (No screen yet — this is plumbing consumed by later tasks.)

- [ ] **Step 9: Commit**

```bash
git add apps/app/package.json apps/app/src/lib apps/app/.env.example firebase.json pnpm-lock.yaml
git commit -m "feat(app): Firebase client, typed API client, auth context, emulator seam"
```

---

## Task 4: SPA — UI primitives, Landing, OTP sign-in, routing

**Files:**

- Create: `apps/app/src/components/ui.tsx`
- Create: `apps/app/src/routes/Landing.tsx`, `apps/app/src/routes/SignIn.tsx`, `apps/app/src/routes/RequireAuth.tsx`
- Modify: `apps/app/src/App.tsx`, `apps/app/src/main.tsx`, `apps/app/index.html` (brand fonts)

**Interfaces:**

- Consumes: `useAuth` (Task 3), `Button` (`@bya/ui`).
- Produces: `Panel`, `Field`, `TextInput`, `Select`, `MultiSelect`, `Pill`, `StepIndicator`, `Spinner`, `ErrorNote` (`components/ui.tsx`); `RequireAuth` wrapper.

- [ ] **Step 1: Load the brand fonts**

In `apps/app/index.html`, add inside `<head>` (before `</head>`), matching the marketing site's Space Grotesk / Plus Jakarta Sans / JetBrains Mono:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
  rel="stylesheet"
/>
```

(Self-hosting for the offline Capacitor bundle is a Phase-7 follow-up, recorded in the spec.)

- [ ] **Step 2: Write the UI primitives**

Create `apps/app/src/components/ui.tsx`:

```tsx
import type { ReactNode, SelectHTMLAttributes } from "react";

export function Panel({
  title,
  sub,
  children,
}: {
  title?: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-cream p-6 shadow-sm sm:p-8">
      {title !== undefined && (
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
      )}
      {sub !== undefined && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
      <div className={title === undefined ? "" : "mt-6"}>{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none focus:border-navy2 ${props.className ?? ""}`}
    />
  );
}

export function Select({ children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={`w-full rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none focus:border-navy2 ${rest.className ?? ""}`}
    >
      {children}
    </select>
  );
}

export function MultiSelect({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
              on
                ? "border-navy2 bg-navy text-cream"
                : "border-line bg-white text-ink-soft hover:bg-paper2"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Pill({
  children,
  tone = "line",
}: {
  children: ReactNode;
  tone?: "navy" | "gold" | "line";
}) {
  const tones = {
    navy: "bg-navy text-cream",
    gold: "bg-gold-soft text-ink",
    line: "border border-line text-ink-soft",
  } as const;
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="mb-7 flex gap-3">
      {steps.map((label, i) => (
        <div key={label} className="flex flex-1 items-center gap-2">
          <div
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold ${
              i <= current ? "bg-navy text-cream" : "border border-line text-sage"
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-sm font-semibold ${i <= current ? "text-ink" : "text-sage"}`}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sage" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-navy" />
      {label !== undefined && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-3 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
      role="alert"
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Write the RequireAuth guard**

Create `apps/app/src/routes/RequireAuth.tsx`:

```tsx
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";
import { Spinner } from "../components/ui.js";

/** Renders children only when signed in; otherwise sends to /signin. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-paper">
        <Spinner label="Loading…" />
      </div>
    );
  if (user === null) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Write the Landing screen**

Create `apps/app/src/routes/Landing.tsx`:

```tsx
import { Button } from "@bya/ui";
import { useNavigate } from "react-router-dom";

export function Landing() {
  const nav = useNavigate();
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 font-body text-ink">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-sage">BookYourAccountant</p>
        <h1 className="mt-3 font-display text-4xl font-bold text-navy">
          Become a verified accountant
        </h1>
        <p className="mt-3 text-ink-soft">
          Sign in with your mobile, pass a short qualifying exam, and go live to businesses.
        </p>
        <Button className="mt-8" onClick={() => nav("/signin?role=accountant")}>
          Get started
        </Button>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Write the OTP sign-in screen**

Create `apps/app/src/routes/SignIn.tsx` (port of legacy `SignIn.jsx` on the new stack; invisible reCAPTCHA on the real project, skipped under the emulator):

```tsx
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@bya/ui";
import { auth, usingEmulator } from "../lib/firebase.js";
import { ErrorNote, Field, Panel, TextInput } from "../components/ui.js";

export function SignIn() {
  const nav = useNavigate();
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (usingEmulator) return; // emulator needs no reCAPTCHA
    if (verifier.current === null) {
      verifier.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
    }
    return () => {
      verifier.current?.clear();
      verifier.current = null;
    };
  }, []);

  const sendOtp = async () => {
    setErr("");
    const clean = phone.replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(clean)) {
      setErr("Enter a valid 10-digit Indian mobile.");
      return;
    }
    setBusy(true);
    try {
      // Under the emulator a dummy verifier is accepted; on the real project the
      // invisible reCAPTCHA above is used.
      const appVerifier =
        verifier.current ??
        new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      confirmation.current = await signInWithPhoneNumber(auth, `+91${clean}`, appVerifier);
      setStage("otp");
    } catch (error) {
      setErr(
        error instanceof Error ? error.message.replace("Firebase: ", "") : "Could not send OTP.",
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setErr("");
    if (!/^\d{6}$/.test(otp)) {
      setErr("Enter the 6-digit code.");
      return;
    }
    if (confirmation.current === null) {
      setErr("Request a code first.");
      return;
    }
    setBusy(true);
    try {
      await confirmation.current.confirm(otp);
      nav("/onboarding", { replace: true });
    } catch {
      setErr("Wrong or expired code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper px-6 py-16 font-body">
      <div className="mx-auto max-w-md">
        <Panel
          title={stage === "phone" ? "Sign in with mobile" : "Enter the code"}
          sub={stage === "phone" ? "We'll text you a 6-digit code." : `Sent to +91 ${phone}.`}
        >
          {err !== "" && <ErrorNote>{err}</ErrorNote>}
          {stage === "phone" ? (
            <>
              <Field label="Mobile number">
                <TextInput
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile"
                  className="font-mono tracking-widest"
                />
              </Field>
              <Button onClick={sendOtp} isLoading={busy} className="w-full">
                Send OTP
              </Button>
            </>
          ) : (
            <>
              <Field label="6-digit code">
                <TextInput
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  placeholder="123456"
                  className="text-center font-mono text-xl tracking-[0.4em]"
                />
              </Field>
              <Button onClick={verifyOtp} isLoading={busy} className="w-full">
                Verify &amp; continue
              </Button>
              <button
                type="button"
                onClick={() => {
                  setStage("phone");
                  setOtp("");
                  setErr("");
                }}
                className="mt-3 w-full text-sm font-semibold text-ink-soft"
              >
                Change number
              </button>
            </>
          )}
        </Panel>
        <div id="recaptcha-container" />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire the route table**

Replace `apps/app/src/App.tsx` with:

```tsx
import { Route, Routes } from "react-router-dom";
import { Landing } from "./routes/Landing.js";
import { SignIn } from "./routes/SignIn.js";
import { RequireAuth } from "./routes/RequireAuth.js";
import { Onboarding } from "./routes/onboarding/Onboarding.js";
import { Accountant } from "./routes/Accountant.js";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signin" element={<SignIn />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Onboarding />
          </RequireAuth>
        }
      />
      <Route
        path="/accountant"
        element={
          <RequireAuth>
            <Accountant />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
```

(`Onboarding` and `Accountant` are created in Tasks 5–6. If executing strictly task-by-task and typecheck must pass now, add temporary one-line placeholder components exporting those names, to be overwritten. Prefer building Tasks 5–6 before the first `pnpm --filter @bya/app build`.)

- [ ] **Step 7: Wrap the app in AuthProvider**

In `apps/app/src/main.tsx`, import and wrap. Change the imports to add:

```tsx
import { AuthProvider } from "./lib/auth-context.js";
```

and wrap `<App />`:

```tsx
<QueryClientProvider client={queryClient}>
  <AuthProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </AuthProvider>
</QueryClientProvider>
```

- [ ] **Step 8: Browser-verify Landing + OTP screen render**

Start the SPA via the preview tool (`preview_start {name}` using `.claude/launch.json` — create an entry running `pnpm --filter @bya/app dev`, port 5173, if absent). Navigate to `/`, confirm the Landing renders with brand fonts; click Get started; confirm `/signin` shows the phone field. Use `read_page`/`read_console_messages` to confirm no runtime errors. (Actual OTP is exercised in Task 7 with the emulator.)

- [ ] **Step 9: Commit**

```bash
git add apps/app/src/App.tsx apps/app/src/main.tsx apps/app/index.html \
        apps/app/src/components/ui.tsx apps/app/src/routes/Landing.tsx \
        apps/app/src/routes/SignIn.tsx apps/app/src/routes/RequireAuth.tsx
git commit -m "feat(app): landing, phone-OTP sign-in, routing, UI primitives"
```

---

## Task 5: SPA — Onboarding orchestrator + exam

**Files:**

- Create: `apps/app/src/components/TimerRing.tsx`
- Create: `apps/app/src/routes/onboarding/Onboarding.tsx`, `apps/app/src/routes/onboarding/ExamStep.tsx`, `apps/app/src/routes/onboarding/LiveExam.tsx`, `apps/app/src/routes/onboarding/ExamResult.tsx`

**Interfaces:**

- Consumes: `useAuth`; `bootstrapUser`, `startExam`, `submitExam`, `useAccountant` (Task 3); `Panel`, `Pill`, `StepIndicator`, `Spinner`, `ErrorNote` (Task 4); `EXAM_POLICY`, `PublicQuestion`, `ExamResult` (`@bya/shared`).
- Produces: `Onboarding` (default route element); `ExamStep({ onPass }: { onPass: () => void })`.

- [ ] **Step 1: Write the TimerRing**

Create `apps/app/src/components/TimerRing.tsx`:

```tsx
export function TimerRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 23;
  const circumference = 2 * Math.PI * r;
  const frac = total === 0 ? 0 : remaining / total;
  const low = remaining <= 5;
  return (
    <div className="relative h-14 w-14" title="Seconds remaining">
      <svg width={54} height={54} className="-rotate-90">
        <circle cx={27} cy={27} r={r} fill="none" stroke="#E7E1D2" strokeWidth={4} />
        <circle
          cx={27}
          cy={27}
          r={r}
          fill="none"
          stroke={low ? "#C0492F" : "#142719"}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={(1 - frac) * circumference}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s linear, stroke .2s" }}
        />
      </svg>
      <div
        className={`absolute inset-0 grid place-items-center font-mono text-sm font-bold ${
          low ? "text-danger" : "text-navy"
        }`}
      >
        {remaining}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the LiveExam (timer, auto-advance, no-back, idempotent submit)**

Create `apps/app/src/routes/onboarding/LiveExam.tsx` (faithful to legacy `ExamStep.jsx` LiveExam, rewired to the `submitExam` REST call):

```tsx
import type { ExamResult, PublicQuestion } from "@bya/shared";
import { useEffect, useRef, useState } from "react";
import { Button } from "@bya/ui";
import { submitExam } from "../../lib/queries.js";
import { ErrorNote, Panel, Pill, Spinner } from "../../components/ui.js";
import { TimerRing } from "../../components/TimerRing.js";

export function LiveExam({
  questions,
  sessionId,
  secondsPerQ,
  onResult,
}: {
  questions: PublicQuestion[];
  sessionId: string;
  secondsPerQ: number;
  onResult: (r: ExamResult) => void;
}) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [remaining, setRemaining] = useState(secondsPerQ);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");

  const answersRef = useRef<Record<number, number>>({});
  const advancedFor = useRef(-1); // highest index advanced FROM
  const submitted = useRef(false); // hard idempotency guard

  const send = async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    setSubmitErr("");
    try {
      const arr = questions.map((_q, idx) => answersRef.current[idx] ?? -1);
      onResult(await submitExam({ sessionId, answers: arr }));
    } catch (error) {
      submitted.current = false; // allow manual retry
      setSubmitErr(error instanceof Error ? error.message : "Could not submit. Try again.");
      setSubmitting(false);
    }
  };

  const advanceFrom = (from: number) => {
    if (advancedFor.current >= from) return;
    advancedFor.current = from;
    if (from >= questions.length - 1) void send();
    else setI((prev) => (prev === from ? from + 1 : prev));
  };

  useEffect(() => {
    setRemaining(secondsPerQ);
    const startI = i;
    let fired = false;
    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(tick);
          if (!fired) {
            fired = true;
            advanceFrom(startI);
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  if (submitting)
    return (
      <Panel title="Submitting answers…">
        <Spinner label="Scoring on the server. Don't refresh." />
      </Panel>
    );

  const q = questions[i];
  if (q === undefined) return null;
  const chosen = answers[i];
  const locked = chosen !== undefined;
  const last = i === questions.length - 1;

  const pick = (oi: number) => {
    if (locked) return;
    const next = { ...answers, [i]: oi };
    setAnswers(next);
    answersRef.current = next;
    setTimeout(() => advanceFrom(i), 350);
  };

  return (
    <Panel title="Qualifying examination" sub="Closed-book. Answer from your own knowledge.">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Pill tone="gold">{q.topic}</Pill>
          {last && <Pill tone="gold">Final question</Pill>}
          <span className="font-mono text-xs text-sage">
            Q {i + 1} / {questions.length}
          </span>
        </div>
        <TimerRing remaining={remaining} total={secondsPerQ} />
      </div>

      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-paper2">
        <div
          className="h-full bg-gold transition-all"
          style={{ width: `${String(((i + 1) / questions.length) * 100)}%` }}
        />
      </div>

      <div className="mb-4 font-display text-lg font-semibold text-ink">{q.q}</div>
      <div className="grid gap-2.5">
        {q.options.map((opt, oi) => {
          const sel = chosen === oi;
          return (
            <button
              key={oi}
              type="button"
              onClick={() => pick(oi)}
              disabled={locked}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-[15px] transition ${
                sel ? "border-navy2 bg-navy/5" : "border-line bg-cream"
              } ${locked && !sel ? "opacity-50" : ""}`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-xs ${
                  sel ? "bg-navy text-cream" : "border border-line text-ink-soft"
                }`}
              >
                {String.fromCharCode(65 + oi)}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      {submitErr !== "" && (
        <div className="mt-4">
          <ErrorNote>{submitErr}</ErrorNote>
          <Button onClick={() => void send()}>Retry submission</Button>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between text-xs text-sage">
        <span>No going back — answers lock in automatically.</span>
        <button
          type="button"
          onClick={() => advanceFrom(i)}
          disabled={locked}
          className="rounded-lg border border-line px-3 py-2 font-semibold text-ink-soft disabled:opacity-40"
        >
          Skip
        </button>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 3: Write the ExamResult**

Create `apps/app/src/routes/onboarding/ExamResult.tsx`:

```tsx
import type { ExamResult as Result } from "@bya/shared";
import { EXAM_POLICY } from "@bya/shared";
import { Button } from "@bya/ui";
import { Panel } from "../../components/ui.js";

export function ExamResult({
  result,
  onContinue,
  onRetry,
}: {
  result: Result;
  onContinue: () => void;
  onRetry: () => void;
}) {
  const pct = result.total === 0 ? 0 : Math.round((result.score / result.total) * 100);
  const passRatioPct = Math.round(EXAM_POLICY.passRatio * 100);
  return (
    <Panel>
      <div className="mx-auto max-w-lg py-2 text-center">
        <h2 className="font-display text-2xl font-semibold text-ink">
          {result.passed ? "You passed — congratulations!" : "Not quite this time"}
        </h2>
        <p className="mt-2 text-ink-soft">
          You scored{" "}
          <strong className={`font-mono ${result.passed ? "text-navy" : "text-danger"}`}>
            {result.score}/{result.total}
          </strong>{" "}
          ({pct}%).{result.passed ? " Register your profile to go live to businesses." : ""}
        </p>
        {!result.passed && (
          <p className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            The pass mark is {passRatioPct}%. Attempt policy: 2 attempts per 180 days.
          </p>
        )}
        <div className="mt-6">
          {result.passed ? (
            <Button onClick={onContinue}>Continue to registration</Button>
          ) : (
            <Button variant="ghost" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: Write the ExamStep (instructions → live → result)**

Create `apps/app/src/routes/onboarding/ExamStep.tsx`:

```tsx
import type { ExamPaper, ExamResult } from "@bya/shared";
import { EXAM_POLICY } from "@bya/shared";
import { useEffect, useState } from "react";
import { Button } from "@bya/ui";
import { startExam } from "../../lib/queries.js";
import { ErrorNote, Panel, Pill, Spinner } from "../../components/ui.js";
import { LiveExam } from "./LiveExam.js";
import { ExamResult as ExamResultView } from "./ExamResult.js";

type Phase = "instructions" | "loading" | "exam" | "result";

export function ExamStep({ onPass }: { onPass: () => void }) {
  const [phase, setPhase] = useState<Phase>("instructions");
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [err, setErr] = useState("");

  const begin = async () => {
    setPhase("loading");
    setErr("");
    try {
      setPaper(await startExam());
      setPhase("exam");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not load the exam.");
      setPhase("instructions");
    }
  };

  if (phase === "loading")
    return (
      <Panel title="Loading examination…">
        <Spinner label="Fetching questions securely." />
      </Panel>
    );

  if (phase === "exam" && paper !== null)
    return (
      <LiveExam
        questions={paper.questions}
        sessionId={paper.sessionId}
        secondsPerQ={paper.secondsPerQuestion}
        onResult={(r) => {
          setResult(r);
          setPhase("result");
        }}
      />
    );

  if (phase === "result" && result !== null)
    return (
      <ExamResultView
        result={result}
        onContinue={onPass}
        onRetry={() => {
          setResult(null);
          setPhase("instructions");
        }}
      />
    );

  return (
    <Panel title="Online screen test" sub="A short timed assessment you take right here.">
      {err !== "" && <ErrorNote>{err}</ErrorNote>}
      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone="navy">{EXAM_POLICY.questionsPerAttempt} questions</Pill>
        <Pill tone="line">{EXAM_POLICY.secondsPerQuestion}s per question</Pill>
        <Pill tone="line">Pass mark {Math.round(EXAM_POLICY.passRatio * 100)}%</Pill>
      </div>
      <ul className="mb-6 list-disc space-y-2 pl-5 text-sm text-ink-soft">
        <li>
          Each question has a {EXAM_POLICY.secondsPerQuestion}-second timer. When it hits 0, or you
          answer, the next loads. You cannot go back.
        </li>
        <li>Take it in one sitting. Don't refresh or close the tab.</li>
        <li>Unanswered questions are marked wrong. You may retake if you don't pass.</li>
      </ul>
      <Button onClick={begin}>I understand — start the timed test</Button>
    </Panel>
  );
}
```

- [ ] **Step 5: Write the Onboarding orchestrator**

Create `apps/app/src/routes/onboarding/Onboarding.tsx` (bootstrap-then-exam, resume via `useAccountant`, exam→profile machine):

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context.js";
import { bootstrapUser, useAccountant } from "../../lib/queries.js";
import { ErrorNote, Panel, Spinner, StepIndicator } from "../../components/ui.js";
import { ExamStep } from "./ExamStep.js";
import { ProfileStep } from "./ProfileStep.js";

type Stage = "resolving" | "exam" | "profile";

export function Onboarding() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [stage, setStage] = useState<Stage>("resolving");
  const [err, setErr] = useState("");

  const profile = useAccountant(user?.uid);

  useEffect(() => {
    if (profile.isPending) return;
    if (profile.isError) {
      setErr("Couldn't reach the server. Is the API running on :8080?");
      return;
    }
    // Already verified → straight to the terminal. Any existing profile → also
    // the terminal (rebuild profiles are born verified or not created).
    if (profile.data !== null) {
      nav("/accountant", { replace: true });
      return;
    }
    // No profile yet: ensure the user record exists (role gate), then exam.
    (async () => {
      try {
        await bootstrapUser(user?.phoneNumber ?? undefined);
        setStage("exam");
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not set up your account.");
      }
    })();
  }, [profile.isPending, profile.isError, profile.data, user, nav]);

  return (
    <div className="min-h-screen bg-paper px-6 py-10 font-body">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex justify-end">
          <button
            type="button"
            onClick={() => void signOut().then(() => nav("/", { replace: true }))}
            className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft"
          >
            Sign out
          </button>
        </div>

        {stage !== "resolving" && (
          <StepIndicator steps={["Online test", "Profile"]} current={stage === "exam" ? 0 : 1} />
        )}

        {err !== "" ? (
          <Panel title="Something went wrong">
            <ErrorNote>{err}</ErrorNote>
          </Panel>
        ) : stage === "resolving" ? (
          <Panel title="Getting you set up…">
            <Spinner label="One moment." />
          </Panel>
        ) : stage === "exam" ? (
          <ExamStep onPass={() => setStage("profile")} />
        ) : (
          <ProfileStep onDone={() => nav("/accountant", { replace: true })} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify typecheck (ProfileStep stub exists after Task 6)**

Run: `pnpm --filter @bya/app typecheck`
Expected: fails only on the missing `./ProfileStep.js` until Task 6. Proceed to Task 6, then typecheck both together. (When executing task-by-task, create Task 6's `ProfileStep.tsx` before the first full typecheck/commit of Task 5, or land Tasks 5 and 6 in one commit.)

- [ ] **Step 7: Commit (with Task 6, or after stubbing ProfileStep)**

```bash
git add apps/app/src/components/TimerRing.tsx apps/app/src/routes/onboarding
git commit -m "feat(app): onboarding orchestrator + timed qualifying exam"
```

---

## Task 6: SPA — Profile registration + verified terminal

**Files:**

- Create: `apps/app/src/routes/onboarding/ProfileStep.tsx`
- Create: `apps/app/src/routes/Accountant.tsx`

**Interfaces:**

- Consumes: `useAuth`; `createProfile`, `useAccountant`, `AccountantView` (Task 3); `Panel`, `Field`, `TextInput`, `Select`, `MultiSelect`, `ErrorNote`, `Spinner`, `Pill` (Task 4); `INDIA_STATES`, `CITIES_BY_STATE`, `QUALIFICATIONS`, `LANGUAGES`, `SERVICES`, `ACCOUNTING_SOFTWARE`, `COMPLIANCE_SOFTWARE`, `createAccountantSchema` (`@bya/shared`).
- Produces: `ProfileStep({ onDone }: { onDone: () => void })`; `Accountant` (route element).

- [ ] **Step 1: Write the ProfileStep (form over `createAccountantSchema`)**

Create `apps/app/src/routes/onboarding/ProfileStep.tsx`:

```tsx
import {
  ACCOUNTING_SOFTWARE,
  CITIES_BY_STATE,
  COMPLIANCE_SOFTWARE,
  INDIA_STATES,
  LANGUAGES,
  QUALIFICATIONS,
  SERVICES,
  createAccountantSchema,
} from "@bya/shared";
import { useMemo, useState } from "react";
import { Button } from "@bya/ui";
import { createProfile } from "../../lib/queries.js";
import { ErrorNote, Field, MultiSelect, Panel, Select, TextInput } from "../../components/ui.js";

const toggle = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export function ProfileStep({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [accountingSoftware, setAccountingSoftware] = useState<string[]>([]);
  const [complianceSoftware, setComplianceSoftware] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const cities = useMemo<readonly string[]>(() => CITIES_BY_STATE[state] ?? [], [state]);

  const submit = async () => {
    setErr("");
    const candidate = {
      name,
      state,
      city,
      experienceYears: Number(experienceYears),
      qualifications,
      specialties,
      languages,
      accountingSoftware,
      complianceSoftware,
    };
    const parsed = createAccountantSchema.safeParse(candidate);
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Please complete every required field.");
      return;
    }
    setBusy(true);
    try {
      await createProfile(parsed.data);
      onDone();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Register your profile"
      sub="This is what businesses see. You're already verified."
    >
      {err !== "" && <ErrorNote>{err}</ErrorNote>}

      <Field label="Full name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Asha Rao"
        />
      </Field>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="State">
          <Select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setCity("");
            }}
          >
            <option value="">Select a state</option>
            {INDIA_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City">
          <Select value={city} onChange={(e) => setCity(e.target.value)} disabled={state === ""}>
            <option value="">{state === "" ? "Pick a state first" : "Select a city"}</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Years of experience">
        <TextInput
          value={experienceYears}
          onChange={(e) => setExperienceYears(e.target.value.replace(/\D/g, "").slice(0, 2))}
          inputMode="numeric"
          placeholder="e.g. 8"
        />
      </Field>

      <Field label="Qualifications">
        <MultiSelect
          options={QUALIFICATIONS.map((q) => ({
            value: q,
            label: q.toUpperCase().replace("_", " "),
          }))}
          selected={qualifications}
          onToggle={(v) => setQualifications((l) => toggle(l, v))}
        />
      </Field>

      <Field label="Specialties">
        <MultiSelect
          options={SERVICES.map((s) => ({ value: s.id, label: s.name }))}
          selected={specialties}
          onToggle={(v) => setSpecialties((l) => toggle(l, v))}
        />
      </Field>

      <Field label="Languages">
        <MultiSelect
          options={LANGUAGES.map((l) => ({ value: l, label: l[0]!.toUpperCase() + l.slice(1) }))}
          selected={languages}
          onToggle={(v) => setLanguages((l) => toggle(l, v))}
        />
      </Field>

      <Field label="Accounting software (optional)">
        <MultiSelect
          options={ACCOUNTING_SOFTWARE.map((s) => ({ value: s.value, label: s.label }))}
          selected={accountingSoftware}
          onToggle={(v) => setAccountingSoftware((l) => toggle(l, v))}
        />
      </Field>

      <Field label="Compliance software (optional)">
        <MultiSelect
          options={COMPLIANCE_SOFTWARE.map((s) => ({ value: s.value, label: s.label }))}
          selected={complianceSoftware}
          onToggle={(v) => setComplianceSoftware((l) => toggle(l, v))}
        />
      </Field>

      <Button onClick={submit} isLoading={busy} className="mt-2 w-full">
        Complete registration
      </Button>
    </Panel>
  );
}
```

> **Catalogue shapes (verified 2026-07-24):** `SERVICES` elements are `{ id, name, active }`; `ACCOUNTING_SOFTWARE` and `COMPLIANCE_SOFTWARE` elements are `{ value, label }` (hence the different `.map`s above — specialties use `s.id/s.name`, software uses `s.value/s.label`). `QUALIFICATIONS`/`LANGUAGES` are `readonly string[]`. If these drift, adjust the `.map`s.

- [ ] **Step 2: Write the verified terminal**

Create `apps/app/src/routes/Accountant.tsx`:

```tsx
import { useAuth } from "../lib/auth-context.js";
import { useAccountant } from "../lib/queries.js";
import { Panel, Pill, Spinner } from "../components/ui.js";

export function Accountant() {
  const { user, signOut } = useAuth();
  const profile = useAccountant(user?.uid);

  return (
    <div className="min-h-screen bg-paper px-6 py-10 font-body">
      <div className="mx-auto max-w-2xl">
        {profile.isPending ? (
          <Panel title="Loading your profile…">
            <Spinner />
          </Panel>
        ) : profile.data === null || profile.isError ? (
          <Panel title="Profile not found">
            <p className="text-ink-soft">We couldn't load your profile. Try signing in again.</p>
          </Panel>
        ) : (
          <Panel>
            <div className="text-center">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-navy/10 text-2xl">
                {profile.data.verified ? "✓" : "⏳"}
              </div>
              <h1 className="font-display text-2xl font-bold text-navy">
                {profile.data.verified ? "You're verified" : "Profile under review"}
              </h1>
              {profile.data.verified && profile.data.examTotal !== undefined && (
                <p className="mt-1 text-ink-soft">
                  {profile.data.examScore}/{profile.data.examTotal} on the qualifying exam. Your
                  profile is live to businesses.
                </p>
              )}
            </div>

            <dl className="mt-6 grid gap-3 border-t border-line pt-6 text-sm">
              <Row label="Name" value={profile.data.name} />
              <Row label="Location" value={`${profile.data.city}, ${profile.data.state}`} />
              <Row label="Experience" value={`${String(profile.data.experienceYears)} years`} />
              <ChipRow
                label="Qualifications"
                values={profile.data.qualifications.map((q) => q.toUpperCase())}
              />
              <ChipRow label="Specialties" values={profile.data.specialties} />
              <ChipRow label="Languages" values={profile.data.languages} />
            </dl>

            <p className="mt-6 rounded-lg bg-paper2 px-4 py-3 text-xs text-ink-soft">
              Dashboard (assignments, earnings, MIS) arrives in a later phase.
            </p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-4 text-sm font-semibold text-ink-soft"
            >
              Sign out
            </button>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-sage">{label}</dt>
      <dd className="text-right font-semibold text-ink">{value}</dd>
    </div>
  );
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-sage">{label}</dt>
      <dd className="flex flex-wrap justify-end gap-1.5">
        {values.map((v) => (
          <Pill key={v} tone="line">
            {v}
          </Pill>
        ))}
      </dd>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck, lint, build the whole SPA**

Run: `pnpm --filter @bya/app typecheck && pnpm --filter @bya/app lint && pnpm --filter @bya/app build`
Expected: all clean. Fix any `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess` complaints at their source (no `any`, no `eslint-disable` beyond the one documented `react-hooks/exhaustive-deps` in `LiveExam`).

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/routes/onboarding/ProfileStep.tsx apps/app/src/routes/Accountant.tsx
git commit -m "feat(app): profile registration + verified accountant terminal"
```

---

## Task 7: End-to-end browser verification + docs

The slice is not done until the whole journey is watched working. Primary path: the Auth emulator. Fallback stated inline.

**Files:**

- Create/modify: `.claude/launch.json` (SPA + API dev entries, if absent)
- Modify: `COVERAGE.md`, `CLAUDE.md`, `PARITY-CHECKLIST.md` (record the slice + parity table)

- [ ] **Step 1: Boot the API against a local mongod + dev verifier**

Ensure `apps/api/.env` has `MONGODB_URI` (use `bash apps/api/scripts/local-db.sh` for an offline mongod on 27018), `FIREBASE_PROJECT_ID=accountant-on-call`, `FIREBASE_ALLOW_UNREVOKED_CHECK=true`, and `ALLOWED_ORIGINS` including `http://localhost:5173`. For the emulator path, also export `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` in the API's shell before starting it, then seed and start:

```bash
pnpm --filter @bya/api seed
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 pnpm --filter @bya/api dev
```

- [ ] **Step 2: Start the Auth emulator**

```bash
npx -y firebase-tools emulators:start --only auth --project accountant-on-call
```

Expected: Auth emulator listening on `127.0.0.1:9099`. If `firebase-tools`/Java cannot run in this sandbox, STOP the emulator path and go to Step 6 (fallback), stating clearly that the browser walkthrough used component-level verification + the API e2e test, and hand the user the one-step live walkthrough.

- [ ] **Step 3: Start the SPA pointed at the emulator**

Create/confirm `.claude/launch.json` has an `@bya/app` entry (`pnpm --filter @bya/app dev`, port 5173). Start it with `VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` (put it in `apps/app/.env.local`). Open the preview at `http://localhost:5173`.

- [ ] **Step 4: Walk the journey in the browser**

1. `/` → Get started → `/signin`.
2. Enter a fictional 10-digit number (e.g. `9999999999`) → Send OTP. Under the emulator no SMS is sent; the verification code is printed to the **emulator process output** — read it (BashOutput of the emulator process).
3. Enter the code → Verify → lands on `/onboarding`, which bootstraps the user and shows the exam instructions.
4. Start the test → answer 20 questions (watch the ring timer, auto-advance, no-back). To force a pass while verifying, you may answer deliberately; a fail just shows the retry path — both are valid to observe.
5. On a pass → Continue → ProfileStep. Fill name/state/city/experience/qualifications/specialties/languages → Complete registration.
6. Land on `/accountant` showing **"You're verified"** + the score + the profile summary.

Capture a screenshot of the verified terminal (`computer {action:"screenshot"}`) and confirm via `read_console_messages` there are no runtime errors, and via `read_network_requests` that `POST /v1/accountants` returned 201 with `verified:true`.

- [ ] **Step 5: Confirm the born-verified guarantee end-to-end**

In `read_network_requests`, confirm the `POST /v1/accountants` request body contains **no** `verified` field, yet the response `accountant.verified === true`. This is the security property watched, not assumed.

- [ ] **Step 6: (Fallback, only if Step 2 failed) component + live handoff**

Verify each screen renders and routes (Landing, SignIn phone/otp stages, Onboarding instructions with a mocked paper via a temporary dev flag if needed, ProfileStep validation, Accountant terminal against a manually-seeded verified profile). Rely on the Task 2 API e2e test as the journey's proof. Then tell the user the one manual step: add a Firebase console **test phone number** (Authentication → Sign-in method → Phone → Phone numbers for testing, e.g. `+91 99999 99999` / `123456`), and offer to confirm the live login→exam→verified path with them.

- [ ] **Step 7: Record the slice in the docs**

- `COVERAGE.md`: flip §4 (Auth & onboarding) and §11 (Qualifying exam) client rows to reflect the SPA screens built; note the accountant profile register path is live.
- `CLAUDE.md` "Current state": update the `apps/app` row from "shell — still Phase 1" to the onboarding+exam slice being live, and the "Next actions" to point at the next slice.
- `PARITY-CHECKLIST.md`: add the slice's parity table (from the spec's Scope Boundaries), each row with status + dated decision.

- [ ] **Step 8: Commit the docs**

```bash
git add COVERAGE.md CLAUDE.md PARITY-CHECKLIST.md .claude/launch.json
git commit -m "docs: record the accountant onboarding + exam slice (built, walked)"
```

---

## Self-Review

**Spec coverage:** journey (Tasks 4–6) ✓; bootstrap-then-exam sequence (Task 5 Onboarding + Task 2 test) ✓; born-verified (Tasks 2, 6, 7 step 5) ✓; gated no-key verifier + production refusal (Task 1) ✓; emulator seam (Task 3) ✓; verified-summary terminal, no faked dashboard (Task 6) ✓; parity map screens (Tasks 4–6) ✓; profile = `createAccountantSchema` only, rate slab deferred (Task 6) ✓; error handling — throttle/network/submit-retry (Tasks 4–5) ✓; testing & verification (Tasks 1, 2, 7) ✓; scope-boundary DEFER decisions recorded (Task 7 step 7) ✓.

**Placeholder scan:** the only intentional "stub" note is the Task 4→5→6 ordering caveat (App.tsx references components built in later tasks) — handled explicitly by landing Tasks 5–6 before the first full build. No TBD/TODO/"add error handling" left.

**Type consistency:** `AccountantView` defined in `queries.ts` (Task 3) and consumed by Tasks 5–6; `startExam/submitExam/createProfile/bootstrapUser/useAccountant` names match across tasks; `ExamStep({onPass})`, `ProfileStep({onDone})`, `LiveExam({questions,sessionId,secondsPerQ,onResult})`, `firebaseVerifier(projectId, {checkRevoked})` consistent between definition and call sites; `EXAM_POLICY` fields (`questionsPerAttempt`, `secondsPerQuestion`, `passRatio`) match `@bya/shared`.

**One flagged verification-time check** (not a plan gap): Task 6 Step 1 notes confirming the `{id,name}` shape of the software catalogues before writing the `.map`s — the safe kind of "read before you code", with the exact grep given.
