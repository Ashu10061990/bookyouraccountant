# Vertical slice: accountant onboarding + exam (end-to-end)

**Date:** 2026-07-24 · **Method:** vertical slice (CLAUDE.md §"How to work here")
**Goal:** a real, clickable journey in the browser — phone-OTP sign-in → the
20-question qualifying exam → register profile → **verified accountant** — wired
to the existing, tested API and real data. Done means _watched working_, not
_compiles_.

This is `apps/app` (the Vite SPA), which is still a Phase-1 shell, plus the
Firebase **client** auth it has never had. The whole backend already exists and
is tested (`/v1/exam/start`, `/v1/exam/submit`, `/v1/accountants`,
verify-on-pass). One small API-side change is needed (below).

---

## The journey and the backend sequence it forces

```
Landing → OTP sign-in → [bootstrap role] → EXAM → PROFILE → verified accountant
  /          /signin      POST /v1/users   start/  POST /v1/accountants   /accountant
                          {role:accountant} submit  (born verified)       (GET :uid)
```

The order (**exam before profile**) is the legacy's own order
(`AccountantOnboard.jsx`: `order = ["exam", "profile"]`) and is what the
born-verified backend expects.

The non-obvious step is **bootstrap**. The exam routes are
`requireAuth + requireRole("accountant")`, and `requireAuth` 401s a valid token
that has no user row (`"Finish setting up your account"`). So immediately after
OTP the SPA does `POST /v1/users {role:"accountant", phone}`. A `409` ("This
account already exists") is treated as success — the identity is already
bootstrapped. Only then can the exam start.

On a passing submit the server records a passing `examAttempts` row. When the SPA
then `POST /v1/accountants`, the route resolves the latest exam pass server-side
and marks the new profile verified — **the client never sends `verified`**
(`assertNoServerOwnedFields` refuses it against the raw body). The terminal page
reads `GET /v1/accountants/:uid`; as the owner, the caller receives the private
view (`verified`, `examScore`, `examTotal`).

### Endpoints consumed (all already built)

| Step                  | Call                       | Guard             | Notes                                                                              |
| --------------------- | -------------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| Bootstrap             | `POST /v1/users`           | verified token    | `{role, phone}`; 409 ⇒ continue                                                    |
| Exam paper            | `POST /v1/exam/start`      | auth + accountant | returns `sessionId`, 20 `questions`, `secondsPerQuestion` (30), `passRatio` (0.75) |
| Submit                | `POST /v1/exam/submit`     | auth + accountant | `{sessionId, answers[]}` → `{score,total,passed}`; idempotent                      |
| Specialties catalogue | `GET /v1/services`         | public            | populates the profile's specialty picker                                           |
| Register profile      | `POST /v1/accountants`     | verified token    | body = `createAccountantSchema`; born verified from the recorded pass              |
| Terminal read         | `GET /v1/accountants/:uid` | optional token    | owner ⇒ private view (verified, score)                                             |

---

## Parity map (legacy → rebuild)

| Legacy (`BYA& Keiri/bya-new`)                             | Rebuild                                      | Change                                                                                      |
| --------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `SignIn.jsx` (phone OTP, RecaptchaVerifier)               | `routes/SignIn.tsx`                          | same Firebase flow; Tailwind/`@bya/ui` styling; lead capture folded into `POST /v1/users`   |
| `AccountantOnboard.jsx` (stage machine, resume)           | `routes/onboarding/Onboarding.tsx`           | same exam→profile machine + resume; state from the API, not Firestore                       |
| `accountant/ExamStep.jsx` (timer, no-back, idempotent)    | `routes/onboarding/ExamStep.tsx`             | faithful UX; `httpsCallable` → REST with bearer token                                       |
| `accountant/ProfileStep.jsx` (377 lines, incl. rate slab) | `routes/onboarding/ProfileStep.tsx`          | form = **exactly `createAccountantSchema`**; the rate slab is out of this slice (see scope) |
| `lib/AuthContext.jsx` (Firestore profile fetch)           | `lib/auth-context.tsx`                       | leaner: Firebase user only; profile via React Query                                         |
| `lib/firebase.js` + `firebaseConfig.js`                   | `lib/firebase.ts` + `lib/firebase-config.ts` | public web config carried over; App Check omitted for the slice (was monitoring-mode only)  |
| `components/ui.jsx` (`C`, `Panel`, `Pill`…)               | `components/ui.tsx`                          | rebuilt on the rebuild's green/gold Tailwind tokens, not legacy inline navy                 |

Visual language follows the **rebuild's** established brand (`@bya/ui` tokens +
Tailwind preset: deep-green `navy #142719` / `gold #E9A23B`), matching the
marketing site — not the legacy's inline palette.

---

## Architecture (all new files in `apps/app/src`)

**Client foundation**

- `lib/firebase-config.ts` — the public Firebase web config (from the frozen
  legacy bundle; public by design), with `import.meta.env` overrides.
- `lib/firebase.ts` — `initializeApp` + `initializeAuth` (phone). When
  `VITE_FIREBASE_AUTH_EMULATOR_HOST` is set, `connectAuthEmulator` — off by
  default so the real project is untouched.
- `lib/api.ts` — typed fetch client. Base URL `VITE_API_BASE_URL`
  (default `http://localhost:8080`). Attaches `Authorization: Bearer` from
  `auth.currentUser.getIdToken()`. Maps the API's stable 4xx `error.code`s to
  typed client errors (so 409-on-bootstrap is distinguishable).
- `lib/auth-context.tsx` — `AuthProvider` (`onAuthStateChanged`) exposing
  `user`, `loading`, `signOut`, `getToken`.
- `lib/queries.ts` — React Query hooks/mutations: `useMe`, `useAccountant(uid)`,
  `bootstrapUser`, `startExam`, `submitExam`, `createProfile`.
- `components/ui.tsx` — Tailwind primitives absent from `@bya/ui`: `Panel`,
  `Field`, `TextInput`, `Select`, `MultiSelect`, `Pill`, `StepIndicator`,
  `TimerRing`, `Spinner`, `ErrorNote`.

**Screens / routes**

- `routes/Landing.tsx` (`/`) — accountant entry CTA → `/signin`.
- `routes/SignIn.tsx` (`/signin`) — phone → OTP (invisible reCAPTCHA on the real
  project; skipped under the emulator).
- `routes/RequireAuth.tsx` — redirects to `/signin` when signed out.
- `routes/onboarding/Onboarding.tsx` (`/onboarding`) — orchestrator + resume.
- `routes/onboarding/ExamStep.tsx` — Instructions → LiveExam (30s ring, auto-
  advance, no-back, skip, single idempotent submit) → Result.
- `routes/onboarding/ProfileStep.tsx` — `createAccountantSchema` form.
- `routes/Accountant.tsx` (`/accountant`) — **verified confirmation + read-only
  profile summary** (this slice's terminal; dashboard tabs are Phase 5).
- `App.tsx` route table + `main.tsx` wrapped in `AuthProvider`.

**Resume logic** (`Onboarding` on mount, mirroring legacy): `GET /v1/accountants/:uid`
for the current uid — `200 & verified` ⇒ `/accountant`; `404` ⇒ bootstrap (if
needed) then exam; `200 & !verified` ⇒ `/accountant` (under-review summary, a
rare edge in the rebuild since profiles are born verified or not created). The
"passed but abandoned before profile" edge self-heals: the profile 404s, the
user retakes, and a pass is not re-throttled (`assertNotThrottled` counts only
fails).

**API-side change (the one piece of backend work)**

- `platform/auth.ts` — `firebaseVerifier(projectId?, opts?: {checkRevoked})`.
  Production keeps `applicationDefault()` + `checkRevoked:true` (unchanged).
- `platform/env.ts` — add `FIREBASE_ALLOW_UNREVOKED_CHECK` (boolean, default
  false). Dev-only path: `initializeApp({projectId})` (no credentials) +
  `checkRevoked:false`. Tokens are still really verified against Google's public
  certs (signature, issuer, audience, expiry); the only loss is that a
  signed-out token stays valid until it expires (≤1h).
- **Boot refusal**: if `FIREBASE_ALLOW_UNREVOKED_CHECK` is true while
  `NODE_ENV=production`, the process refuses to start. A check that cannot fail
  is no check — this one can.
- Also honor `FIREBASE_AUTH_EMULATOR_HOST` (Admin SDK native) for the local
  emulator path.
- `.env` gains `FIREBASE_PROJECT_ID=accountant-on-call` and the dev flag.
  `ALLOWED_ORIGINS` already includes `http://localhost:5173`.

---

## Error handling

- OTP: invalid number / wrong code / expired code surfaced inline (legacy
  parity); the verifier's raw message is never shown as-is.
- Bootstrap 409 ⇒ proceed. Any other bootstrap failure blocks the exam with a
  retry.
- Exam throttle (`403` after 2 fails / 180 days) ⇒ the Result screen's locked
  state, with the next-attempt date from the API message.
- Submit network failure ⇒ manual "Retry submission" (legacy parity), the
  idempotency guard prevents a double attempt.
- API base unreachable ⇒ a single clear "can't reach the server" note, not a
  spinner that hangs.

---

## Testing & verification (part of the slice)

- **API unit** — the verifier option decision (`checkRevoked`/`projectId` by
  env) and the production-refusal boot assertion. Break-it-to-prove-it: the
  refusal test asserts the process _would_ throw.
- **API integration** — `onboarding.e2e.test.ts` via the existing `fakeVerifier`:
  `POST /v1/users` → `exam/start` → `exam/submit` (a passing key) → `POST
/v1/accountants` → `GET /v1/accountants/:uid` shows `verified:true`. Proves the
  whole backend journey deterministically, no Firebase.
- **Browser (the real bar)** — boot the API (local `mongod` + dev verifier) and
  the SPA, then walk OTP → exam → profile → verified via the **Auth emulator**
  seam, watching each screen pull from the real API. If firebase-tools/Java
  can't run in this sandbox, fall back to: verify every screen renders/routes +
  the API e2e test above, and hand over a one-step live walkthrough (console
  test number) — stating plainly which was done.
- `apps/app` keeps **no unit test script** (deliberate, per CLAUDE.md — a
  `--passWithNoTests` script asserts nothing).

---

## Scope boundaries (prime directive: nothing dropped, everything deferred is recorded)

**In this slice:** the six files/areas in the parity map, the client foundation,
the one API verifier change, and the verified-summary terminal.

**Explicitly deferred (decision: DEFER, 2026-07-24, this slice):**

- **Rate slab** (`RateField.jsx`, `rateSlab.js`) — pricing, not identity; not in
  `createAccountantSchema`. Belongs with the assignment/pricing surface.
- **KYC step** (`PUT /v1/accountants/me/kyc`) — the backend exists; the
  onboarding _screen_ for it is a natural follow-up slice, not part of "become a
  verified accountant".
- **Accountant dashboard tabs** (earnings, assignments, etc.) — Phase 5;
  blocked partly on §18 Q1.
- **Business onboarding** — a separate slice.
- **App Check** — was monitoring-mode (non-enforcing) in legacy; omitted for the
  local slice, noted for the Capacitor phase.
- **Self-hosted brand fonts** — the slice loads brand fonts simply (link/tag);
  self-hosting for the offline Capacitor bundle is a Phase-7 follow-up.

**Parity table (for the phase gate):**

| Inventory § | Feature                        | Status after slice            | Decision                |
| ----------- | ------------------------------ | ----------------------------- | ----------------------- |
| §4          | Auth & onboarding (OTP → role) | built (client)                | PORT                    |
| §11         | Qualifying exam screen         | built (client)                | PORT                    |
| §6          | Accountant profile register    | built (client, born-verified) | PORT                    |
| §6          | Accountant dashboard tabs      | not built                     | DEFER — Phase 5         |
| §6/§20      | Rate slab / `RateField`        | not built                     | DEFER — pricing surface |
| §6          | KYC onboarding screen          | not built                     | DEFER — next slice      |

---

## Env / config summary

**`apps/app/.env(.example)`** — `VITE_API_BASE_URL`, optional
`VITE_FIREBASE_AUTH_EMULATOR_HOST`, optional Firebase config overrides.
**`apps/api/.env`** — add `FIREBASE_PROJECT_ID=accountant-on-call`,
`FIREBASE_ALLOW_UNREVOKED_CHECK=true` (dev). `ALLOWED_ORIGINS` unchanged
(already has 5173).

## Open follow-ups (not blocking this slice)

- Rotate the Atlas password (disclosed in chat) — tracked in CLAUDE.md.
- The real service-account key still closes the "no real token ever _accepted_"
  item; the dev path unblocks the slice but the key remains the production path.
