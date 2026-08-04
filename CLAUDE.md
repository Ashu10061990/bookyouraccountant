# BookYourAccountant — working context

Marketplace connecting Indian MSMEs with verified accountants. Handles real money
(Razorpay), statutory payout maths (TDS/GST), and KYC data (PAN, bank details).

**This repo is a rebuild of a live production system.** The old system still serves
paying customers. Read the next section before writing any code.

---

## ⛔ PRIME DIRECTIVE — do not drop a single feature

The legacy app is being **replaced, not redesigned**. Every feature it has must exist in
the rebuild, or be dropped by an explicit, written, dated decision. Never by omission.

### The authority

**`../BYA& Keiri/FEATURE-INVENTORY.md`** — 23 sections cataloguing every screen, tab,
route, Cloud Function, collection, business rule and reference dataset in the legacy
system. It is the parity contract. If something is in there and not in the rebuild, the
rebuild is not done.

### The trap that will actually bite you

**The features most likely to be lost are the ones that don't currently work.**

Anyone rebuilding by opening the live app and copying what they see will miss these,
because they are invisible at runtime — fully built, but unreachable:

| Feature                                                                       | Inventory § | Why it's invisible                           |
| ----------------------------------------------------------------------------- | ----------- | -------------------------------------------- |
| Accountant browse marketplace — search, filters, match scores, `BookingModal` | §5          | ~200 lines with no tab button pointing at it |
| **The entire booking engine**                                                 | §8          | Orphaned by the above                        |
| MIS financial dashboard, `ClientUpload`, `processClientTemplate`              | §9          | All depend on bookings existing              |
| `ComplianceOverridesEditor` — admin pushes due-date extensions                | §10, §15    | Imported by AdminHome, never rendered        |
| `BookingsTable`, `askResolve` — admin dispute override                        | §15         | Defined, never rendered                      |
| `AppointmentStep`, `RateField`, `CourseView`, `AssignmentChecklist`           | §20         | Not imported anywhere                        |
| Earnings tab, Payouts tab                                                     | §6, §15     | Crash on open (undefined identifiers)        |

Fourteen such items are catalogued in **§20 Dead / unreachable code register**. Each needs
a recorded _restore / rebuild / drop_ decision. None may be silently skipped.

### Hand-curated data that costs real money to recreate

**§19** lists 12 assets. Losing any means genuine re-work by a domain expert:

- **293-question exam bank** across 11 topics (`functions/examBank.js`)
- **28-point bookkeeping SOP** with Do / Don't / Reconcile per task, plus 19 more
  business-type-specific checks (trading / manufacturing / service)
- **23-obligation statutory compliance calendar**, written against the IT Act 2025
- **`parseTemplate.js`** — the whole GARP spreadsheet → dashboard engine (567 lines)
- Pricing dials: service slabs, synergy factor, catch-up curve, discount tiers
- Payout statutory rates: platform fee, GST, TDS ₹5L threshold, GST TCS
- 36 states + **161** Indian cities (the inventory says 466 — it is wrong, see
  `PARITY-CHECKLIST.md`); marketing copy; 12-entry chatbot knowledge base

> **Status: all 12 are now ported** into `packages/shared` (the exam bank into
> `apps/api`, server-only — it holds the answer key). Each was **generated from
> the frozen source by a script, never retyped**, and each has a count assertion.
> Regenerate rather than hand-edit: `packages/shared/scripts/gen-*.mjs`,
> `apps/api/scripts/gen-exam-bank.mjs`. `parseTemplate.js` is the one §19 item
> still unported — it belongs to the MIS dashboard, blocked on §18 Q1.

### Retention policy — keep everything, prune later (decided by the user)

**Nothing is deleted during the rebuild.** Every file, module, component and dataset in
the legacy system is carried forward, including things that look dead, unreachable or
superseded. Dead-code removal happens in **one dedicated end-to-end scan after parity is
reached**, not opportunistically along the way.

This applies to:

- The ~60 zip archives — **keep them.** (An earlier note in this file suggested deleting
  them once git held the history. That is superseded by this policy.)
- The 14 unreachable/dead items in inventory §20.
- The 3 standalone HTML tools at the legacy root — `Payment_Extractor_Tool.html`,
  `Payment_Register_Tool.html`, `Receivables_Mapper.html`. Status undetermined; keep.
- Anything else you are tempted to call obsolete.

**Consequence for the parity checklist:** `DROP` is not an available decision yet. Until
the pruning scan, the decisions are `PORT`, `REBUILD`, `DEFER`, or `KEEP-UNDECIDED`. If
something genuinely should not be carried forward, record `KEEP-UNDECIDED` with your
reasoning and let the pruning pass adjudicate it with full context.

Rationale: deleting is cheap and reversible later; noticing something you already deleted
is not. The whole point of the inventory is that this system has features invisible at
runtime — exactly the ones a mid-flight cleanup would remove by mistake.

### The gate

**Before any phase is called complete**, walk the inventory section by section and produce
a written parity table:

| Inventory § | Feature                  | Status in rebuild | Decision                                                         |
| ----------- | ------------------------ | ----------------- | ---------------------------------------------------------------- |
| §7.3        | 28-point bookkeeping SOP | ported verbatim   | keep                                                             |
| §8          | Booking engine           | not built         | **dropped — superseded by assignments, decided <date> by <who>** |

A phase is done when every row has a status **and** a decision. "We forgot" is not a
decision. Attach the table to the phase's completion note.

---

## 🔁 HOW TO WORK HERE — vertical slices, not layers

**Decided by the user, 2026-07-24.** Take **one area and build it completely
end-to-end — backend, frontend, a UI that opens in a browser and works — before
starting the next area.**

Do **not** build horizontal layers (all the API across many features, with
nothing usable). That is what the first stretch of this rebuild did, and it left
a lot built but nothing clickable. The user's words: _"covers area first end to
end than move forward."_

In practice:

- Pick a whole feature or user journey, carry it to a rendering, working screen
  against the real API and real data, **then** pick the next.
- Building real screens is **in scope now**, not deferred to a later phase. Both
  frontends (`apps/web` Next.js, `apps/app` Vite SPA) are live surfaces.
- When you finish a slice, confirm which area to slice next rather than
  resuming a layered plan.
- This never overrides the prime directive: still no feature dropped, still a
  recorded decision for anything deferred.

**Verification is part of the slice.** A slice is not done when it compiles — it
is done when you have opened it and watched it work. See the hard-won lessons: a
fully green pipeline has twice coexisted with something completely broken.

---

## Workspace

`GARP-Associates/` is a plain folder, **not a repo**. Each product is its own GitHub repo
cloned as a sibling:

```
GARP-Associates/
├── garp-tracker/       own repo — firm's internal HRMS. OUT OF SCOPE (spec §19)
├── BYA& Keiri/         legacy source — FROZEN, read-only reference + parity target
├── docs/               specs and plans (local only, not version controlled)
├── bookyouraccountant/ ← you are here
└── keiritech/          own repo — exists on disk; handled in its own session
```

### The legacy folder is frozen

`BYA& Keiri/` is the **currently live** app. Decision D6: **no changes, no fixes, no cost
optimisation.** It keeps serving production until this rebuild replaces it. Do not edit it.
Read it to understand behaviour and to verify parity.

Known defects that persist in production by that decision are recorded in spec §18. They
are accepted risks, not oversights — and each is a requirement the rebuild must satisfy.
One is a **live Razorpay key in plaintext** at `BYA& Keiri/rzp-key.csv`; it is the user's
call and has been raised.

---

## Current state (2026-07-25)

The API is real — authenticated, Atlas-backed — the **marketing site is a real,
working website**, the **accountant onboarding + exam flow works end-to-end** in
the product SPA (`apps/app`): phone-OTP sign-in → 20-question qualifying exam →
register profile → verified accountant, **walked in a browser against the live
API** — and the **third-party integration layer is now built** (2026-07-25):
**AWS S3 file storage, notifications (SMTP/WhatsApp/MSG91), and Razorpay
payments** (webhook-as-source-of-truth + idempotency), each behind a gated port
with **dummy creds** (real creds drop in later — see the resolved decisions).

| Package           | What                                                                                                       | Tests |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ----- |
| `packages/config` | eslint / tsconfig / tailwind presets                                                                       | —     |
| `packages/shared` | money, schemas, all §19 data, pricing/SOP/payout/compliance                                                | 180   |
| `packages/ui`     | brand tokens, Tailwind preset, `Button`                                                                    | 7     |
| `apps/api`        | Fastify + Mongoose + Firebase Auth; modules incl. uploads/notifications/payments; S3/notify/Razorpay ports | 428   |
| `apps/web`        | Next.js marketing **site** — 5 pages, SSR, responsive                                                      | —     |
| `apps/app`        | Vite SPA — **onboarding + exam (walked E2E)** + S3 photo upload                                            | —     |

**615 tests, full gate green** (`format`, `typecheck`, `lint`, `lint:root`,
`test`, `build`, plus `smoke.sh` and `verify-guards.sh`).
Remote: `git@github-garp:Ashu10061990/bookyouraccountant.git`.

> **Read `COVERAGE.md` before assuming anything is done.** It is the blunt map of
> built vs deferred, including the 18-Cloud-Function tally. Headline: roughly a
> quarter of the legacy backend behaviours are built. Nothing is dropped, but
> "not dropped" is not "done".

### What exists

- **`platform/`** — Zod-validated env (fails at boot), Mongoose with fail-loud
  `assertIndexes` (`autoIndex` off), the `TokenVerifier` port, a
  `KeyManagementService` port + AES-256-GCM envelope encryption, pino redaction,
  stable 4xx codes, SIGTERM draining. **Four more gated ports** follow the same
  shape (real adapter + fail-loud/skip fallback, chosen from env): `StoragePort`
  (AWS S3), `Notifier` (SMTP/WhatsApp/MSG91 fan-out), `PaymentGateway` (Razorpay).
- **Third-party integrations (2026-07-25, dummy creds)** — **S3 storage**:
  owner-scoped presigned uploads (`POST /v1/uploads/presign`), accountant
  photo/marksheet keys with a prefix-guard, `GET …/uploads/photo`; the API only
  ever holds object keys, bytes go browser↔S3. **Notifications**: a delivery-log
  collection + `Promise.allSettled` fan-out, wired to `accountant_verified`;
  channels gated on their full secret set (else `skipped`, logged). **Payments**:
  Razorpay order create/fetch + `POST /v1/payments/webhook` with HMAC
  signature verification (constant-time, fixed-length hex) and a unique-index
  **idempotency** store (`paymentEvents`) — the webhook is the source of truth the
  assignment engine will read. All security-critical bits (key scoping, HMAC,
  idempotency, fan-out isolation) are **tested offline**; real sends/charges await
  real creds. **File storage is on AWS S3; Firebase Auth stays** (see decisions).
- **7 API modules** — `services`, `users`, `leads`, `config`, `accountants`,
  `businesses`, `exams`, plus an append-only `audit` log. Each
  `routes → service → repository → schema`.
- **The security layer** — denial tests in `apps/api/src/security/denials.test.ts`,
  **21 guards each mutation-verified** (broken, test confirmed to fail, restored).
  See `FIRESTORE-RULES-PARITY.md`.
- **§19 hand-curated data — 12 of 12 ported.** Exam bank (server-only), SOP
  templates, pricing dials, payout rates, compliance calendar, india, software
  catalogues, marketing copy, chatbot KB. Every one **generated from the frozen
  legacy source, never retyped**, with count assertions.
- **Pure domain engines** in `packages/shared/src/domain/` — `computeQuote`
  (pricing), `buildSopTasks`, `computePayout` (statutory maths), `computePayable`
  (coupon), the compliance calendar. Each proven **byte-for-byte against golden
  vectors captured from the frozen legacy** (`packages/shared/scripts/gen-*.mjs`).
- **The marketing site** (§16) — Home (live savings calculator, FAQ accordion),
  About, Why, Dashboards & MIS, Contact. SSR + SEO metadata, responsive,
  faithful dark-navy/gold brand.
- **Accountant onboarding + exam (§4/§6/§11)** — the SPA's first real journey.
  Firebase **client** auth (phone OTP), a typed API client (bearer token), an
  `AuthProvider`, and the screens: Landing → SignIn → Onboarding (resume + stage
  machine) → ExamStep (30s-per-question ring timer, no-back, idempotent submit) →
  ProfileStep (`createAccountantSchema` form) → verified terminal. The exam is
  server-scored; the profile is **born verified** from the server's recorded pass
  (client never sends `verified`). Verified by walking the whole flow in a browser
  against the live API + Firebase **Auth emulator** (see below), confirming
  born-verification from the actual network trace. Backend was already built +
  tested; this slice added the SPA + a gated no-key dev token verifier.

Two §18 accepted risks are no longer reproduced by the rebuild: accountant bank
details are not world-readable (serialise-on-read), and KYC is encrypted at rest.

Every package emits `dist/`. A package that ships TypeScript source pushes its
build problem onto every consumer — see the `@bya/ui` lesson below.

`apps/web` dev uses **Turbopack** (`next dev --turbopack`). Webpack's dev runtime
fails on this machine; detail in `OPEN-ITEMS.md`.

### Phases ahead

| Phase | Delivers                                                       |
| ----- | -------------------------------------------------------------- |
| 4     | ~40 programmatic compliance SEO pages (the 5 core pages exist) |
| 5     | The product UI — assignment wizard, dashboards, admin console  |
| 6     | Domain-by-domain migration of live data to Atlas               |
| 7     | Capacitor → App Store / Play Store                             |

Phase numbering is the spec's. Given the vertical-slice method above, treat this
as a backlog of **areas** rather than a strict order — pick the next whole area
and finish it end-to-end.

---

## Architecture (spec §2 decisions)

- **Two frontends by design.** SEO needs SSR (Next.js); Capacitor needs a static bundle
  (Vite). No single app is both, and the surfaces have opposite requirements anyway —
  logged-in pages are `noindex`. Do not try to merge them.
- **Firebase Auth stays.** Only data moves to MongoDB Atlas. Auth is not the cost driver
  and re-implementing it is the easiest thing to get catastrophically wrong.
- **Money is always integer paise.** `Decimal128` at rest. Never float arithmetic.
- **Modules, not layers.** `apps/api/src/modules/<domain>/` with
  `routes → service → repository`. Routes never touch Mongo; repositories never hold
  business rules.
- **`packages/shared` is the contract.** Zod schemas, domain constants, pricing tables,
  SOP templates — one copy, imported by API and both clients. This structurally prevents
  the client/server drift the legacy code has.

### The security model's core risk

The legacy app has **two** lines of defence: application code _and_ `firestore.rules`,
which encode real business logic (state transitions, field immutability, experience-tier
gating). **A Node API deletes the second layer.**

> Every rule in the legacy `firestore.rules` must be re-implemented as an explicit
> service-layer guard **with a unit test asserting the denial**. This is a tracked
> deliverable, not a side effect of writing endpoints.

---

## Commands

```bash
pnpm dev          # all three apps
pnpm test         # 517 tests
pnpm lint
pnpm lint:root    # repo-root files — turbo's graph does NOT cover them
pnpm typecheck
pnpm build
```

Ports: API `8080`, SPA `5173`, Web `3000`.

Single package: `pnpm --filter @bya/api dev`

```bash
pnpm --filter @bya/api seed              # idempotent reference data
bash apps/api/scripts/verify-guards.sh   # prove the security guards can fail
bash apps/api/scripts/smoke.sh           # boot the BUILT artifact against a real mongod
```

Run `smoke.sh` before calling anything done. It boots `dist/server.js` against a
real `mongod` (the binary `mongodb-memory-server` already caches — no Atlas
needed), seeds it, and checks health, the public catalogue, the 401s, the 404,
rate-limit headers, seed idempotency and a clean SIGTERM drain. A green
`pnpm test` once coexisted with an API that could not serve a single
database-backed request.

`apps/api` needs a `.env` — copy `.env.example`. `MONGODB_URI` has no default,
deliberately: a fallback pointing at a real cluster writes to the wrong database
and surfaces only as data corruption. Scripts load it via `--env-file-if-exists`.

**Atlas is live and verified.** `cluster0.9fupu2d.mongodb.net`, region
`AP_SOUTH_1` (Mumbai — which is what spec §6.8 requires for DPDP residency).
Seeded; `assertIndexes` built all four unique indexes there and a duplicate was
confirmed rejected with E11000. The connection string must carry an explicit
`/bya` database name — the onboarding string ends at the host, and Mongoose then
silently uses `test`.

For local work with no network: `bash apps/api/scripts/local-db.sh` starts a
persistent `mongod` on 27018 using the binary `mongodb-memory-server` already
caches (no install, no Docker).

---

## Conventions (lint-enforced, CI-gated)

| Rule                                               | Why                                                          |
| -------------------------------------------------- | ------------------------------------------------------------ |
| TypeScript `strict`, no unjustified `any`          | Two production crashes here were undefined identifiers       |
| Files < ~300 lines, services < ~200                | Legacy `functions/index.js` is 1,245 lines and unreviewable  |
| **No silent catch** — handled, rethrown, or logged | ~20 swallowed errors in the legacy code hid a broken feature |
| Repositories are the only Mongoose importers       | Keeps services unit-testable                                 |
| Domain constants in `packages/shared`              | One copy of pricing, SOP, compliance data                    |
| Conventional Commits                               |                                                              |
| Never `--no-verify`, never `eslint-disable`        | Fix the code                                                 |

`no-empty` misses `catch { /* comment */ }`, so a `no-restricted-syntax` AST selector
catches it too — comments aren't AST body nodes.

### Test by risk, not coverage %

Priority order: pure domain logic (pricing, payout maths, `parseTemplate`, compliance
dates) → authorization denials → integration → E2E on five critical paths only.

---

## Hard-won lessons — do not reintroduce these

Six defects were found and fixed during Phase 1. All were in the _plan_, not sloppy
implementation. They share one shape: **a green gate hiding a broken artifact.**

| Defect                                                                                                  | Lesson                                                                                        |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `void app.register(rateLimit, …)` — plugin never attached, zero rate limiting on a payments API         | `void` satisfies `no-floating-promises` while masking the bug. **Await plugin registration.** |
| `@bya/shared` published raw `.ts` — `pnpm build` green, `pnpm start` crashed                            | A build that passes must produce a **runnable** artifact. Verify by booting it.               |
| `moduleResolution: "Bundler"` on Node-emitting packages — extensionless imports typecheck then crash    | Same class, third occurrence. Node packages use `NodeNext`.                                   |
| Root eslint ignored `packages/**` while lint-staged linted exactly those paths — repo was uncommittable | Root and per-package lint must agree.                                                         |
| `formatINR` regex `/                                                                                    | /g` was "space OR space" — a tautology stripping nothing                                      | Passed only because this Node's ICU emits no space. **Verify the assertion, not the green tick.** |
| `import/no-cycle` enabled but with no TS resolver — never traversed a single import                     | A rule that can't resolve imports is decorative.                                              |

**When something passes, ask what it would look like if it were broken.** If the answer is
"the same", the check is worthless.

### Phase 3 found six more of the same shape

None was caught by review. Each was caught by deliberately breaking something,
by running the real artifact, or by opening the page.

| Defect                                                                                                                                                                           | Lesson                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **`server.ts` never called `connectDb()`** — the process booted, `/health` said ok, and every DB endpoint timed out. 232 tests green, API completely non-functional.             | **Boot the artifact.** `pnpm build` passing is not evidence that anything works.                                                        |
| `/health` returned `{status:"ok"}` unconditionally, so a database-less server looked healthy to a load balancer                                                                  | A check that cannot fail is the same as no check. It now 503s when disconnected.                                                        |
| **The marketing site crashed in the browser** with `Cannot read properties of undefined (reading 'call')` while `next build` passed and CI was green — nobody had ever opened it | **Open the page.** A build that compiles is not a page that renders.                                                                    |
| `@bya/ui` shipped raw TypeScript with NodeNext `.js` specifiers pointing at `.tsx`, so every consumer needed bundler-specific resolution magic — and Turbopack ignores it        | **The same defect as Phase 1's `@bya/shared`.** A package that ships source pushes its build problem onto every consumer. Emit `dist/`. |
| The index test passed with `assertIndexes()` replaced by a no-op — Mongoose's `autoIndex` was silently building the index                                                        | Prove the mechanism under test is the one doing the work. `autoIndex` is now off.                                                       |
| The service-layer role guard was shadowed by the schema guard, so route tests stayed green with it deleted                                                                       | Defence in depth is only depth if **each layer is verified separately**.                                                                |
| Denial 7 fetched `/leads/me` and checked it got its own lead — a handler honouring `?uid=` still passed                                                                          | Asserting "I got mine" is not asserting "I could not get theirs". **Attempt the attack.**                                               |

Two to remember. A full green pipeline — 232 tests, lint, typecheck, build —
coexisted with an API that could not serve a single database-backed request,
and separately with a marketing page that threw on load. Nothing short of
starting each one and looking at it would have found either.

The `@bya/ui` entry is the more uncomfortable one: it is the _same_ defect as
Phase 1's `@bya/shared`, in the sibling package, left unfixed because nothing
exercised it. When a lesson gets recorded, check whether it applies anywhere
else before closing it out.

`bash apps/api/scripts/verify-guards.sh` is the tool. It breaks each guard,
confirms the test fails, and restores the file. Re-run it whenever a guard
changes — and note it does not rebuild `@bya/shared`, whose `dist/` is what the
API actually imports.

### The onboarding slice found two more (2026-07-25)

Both were invisible to `typecheck`, `lint`, `build`, and every `app.inject` test,
and both surfaced only by walking the flow in a real browser against a real API.

| Defect                                                                                                                                                                                                                                                                                                                                         | Lesson                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The SPA API client set `content-type: application/json` on **every** request, so bodyless POSTs (`/v1/exam/start`) sent an empty JSON body → Fastify's parser **400s** it. Bootstrap (which has a body) worked, so the bug hid until the exam.                                                                                                 | `app.inject` never sets a stray content-type; the browser's `fetch` does. **The client↔server contract only fully executes in the browser.** Only declare a JSON content-type when there is a body.                                                                           |
| Exam **submit 500'd** against the local dev DB: `submitExam` uses a Mongo transaction, and `apps/api/scripts/local-db.sh` starts a **standalone** mongod — transactions need a replica set. Atlas and the test harness (`MongoMemoryReplSet`) are replica sets, so it was green everywhere except the one place a human would actually run it. | **Any transactional endpoint (exam submit, audited KYC/config writes) 500s against `local-db.sh`.** For a full local walkthrough, run mongod as a single-node replica set (`--replSet rs0` + `replSetInitiate`, `MONGODB_URI=…?replicaSet=rs0`). Recorded in `OPEN-ITEMS.md`. |

Verifying this slice needs Firebase auth in the browser. The rig, all local, no
console/SMS/cost: the **Firebase Auth emulator** (`firebase.json` at the repo
root; `npx firebase-tools emulators:start --only auth --project accountant-on-call`),
the API booted with `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` +
`FIREBASE_ALLOW_UNREVOKED_CHECK=true` against a replica-set mongod, and the SPA
with `VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` (`apps/app/.env.local`).
The emulator prints each OTP to its log. The real project is untouched: the
emulator seam is off unless those env vars are set.

---

## Product decisions — RESOLVED (2026-07-25, by the user; recorded by Claude)

The spec §18 questions were the load-bearing blockers. The user delegated them
("do whatever is required as per the previous code") and they are now settled.
Rationale is recorded so a cold session inherits the _why_, not just the _what_.

1. **§18 Q1 — Bookings vs assignments → ASSIGNMENTS WIN.** In the legacy,
   **assignments are the live, primary product** (post-and-claim, first-accept-
   wins, questionnaire-priced, Razorpay, SOP-gated); **bookings are fully built
   but unreachable** (no UI entry) and strand the MIS dashboard. The rebuild
   commits to the **assignment** model. The booking engine is **not ported**
   (kept in the frozen legacy for reference per the retention policy; a
   `KEEP-UNDECIDED` that the pruning scan formalises). **The MIS dashboard is
   rewired to derive its client list from assignments, not bookings** — which is
   what unstrands it.
2. **§18 Q2 — Browse marketplace vs post-and-claim → POST-AND-CLAIM.** No
   browse-and-book flow (that was the booking entry). A **read-only accountant
   showcase** stays for discovery (`GET /v1/accountants`, already built,
   safe-field). Engagement is: business posts an assignment → verified
   accountants claim it.
3. **§18 Q3 — Seed six services vs bookkeeping-only → SEED ALL 7.** The pricing
   engine, SOP templates, booking validator and `functions/seed.js` all define
   **seven** services; `SERVICES` in `packages/shared` already carries all 7.
   Ship the full catalogue, not bookkeeping-only. (Note the open sub-question
   this surfaced: profile _specialties_ currently use `SERVICES` (7) vs the
   documented `PROFILE_SERVICES` (10) matching vocab — reconcile when the
   matching feature is built.)
4. **Keiritech vs BYA → SEPARATE, by definition.** **Keiritech is the parent
   _company_** (its own marketing "face" website, handled in a separate repo/
   session); **BYA is the _product_.** Not a brand merge — two different things.
   The rebuild already treats Keiritech as a separate repo.
5. **§18 Q5 — built-but-unshipped course + account-head SOP → KEEP-UNDECIDED
   (defer).** Carried in the frozen legacy; port only if a later slice needs
   them. Not a priority.
6. **§18 Q6 — redesign vs parity-first → PARITY-FIRST.** The prime directive
   stands: replace, don't redesign. No feature dropped except by a dated written
   decision (this list).

### Infrastructure decisions (2026-07-25)

- **Cloud → AWS.** File storage is **AWS S3** (the legacy Cloud Storage
  equivalent: resumes, marksheets, KYC doc images, photos, MIS `.xlsx`).
  Compute/hosting moves to AWS (ECS / App Runner / Lambda / Amplify — a DevOps
  choice, not app code; the API is portable Fastify/Node, the SPA a static
  bundle). **MongoDB Atlas stays** (cloud-agnostic). Secrets → **AWS Secrets
  Manager** (supersedes the spec's Secret Manager/Doppler note).
- **Auth → Firebase Auth STAYS.** Identity is cloud-agnostic and the onboarding
  slice already ships on it; "AWS" means compute + storage + hosting, **not**
  auth. Moving to Cognito would rebuild the auth layer for no stated benefit —
  not done without an explicit call. _If you want Cognito, say so before the next
  auth-touching slice._
- **Third-party integrations → ports + gated adapters, dummy creds now.**
  Razorpay (payments), WhatsApp Cloud API + MSG91 (SMS) + SMTP (email,
  notifications). Built behind ports like the existing `TokenVerifier` /
  `KeyManagementService`, each adapter **fails loud or no-ops when unconfigured**
  (never silently); real creds land later via env / Secrets Manager.

### Superseding decisions (2026-08-04, by the user; recorded by Claude)

These supersede parts of the 2026-07-25 record above. Any Firebase reference
elsewhere in this file is **historical** — kept for context, no longer true.

1. **Firebase is fully removed.** The user explicitly requested total migration
   off Firebase (the "say so before the next auth-touching slice" condition was
   met). Auth is now first-party: **phone OTP via MSG91** (through the existing
   gated notifier port) + **HS256 JWT access tokens (`jose`) + rotating hashed
   refresh tokens in Mongo** with family-revocation on reuse. Endpoints:
   `POST /v1/auth/otp/request | otp/verify | refresh | logout`. The identity
   key `firebaseUid` is renamed **`authUid`** everywhere; the production data
   migration is `apps/api/src/scripts/migrations/2026-08-04-rename-firebase-uid.ts`
   (`pnpm --filter @bya/api migrate:auth-uid`, idempotent). `firebase.json`,
   `firebase-admin`, the `firebase` client SDK, and the Auth-emulator dev rig
   are all deleted. Dev seam: `AUTH_DEV_ECHO_OTP=true` (boot-refused in
   production) echoes the OTP in the response so local walkthroughs need no
   MSG91 creds. New env: `JWT_SECRET` (required, ≥32 chars), optional
   `OTP_TTL_SEC`/`OTP_MAX_ATTEMPTS`/`OTP_RESEND_COOLDOWN_SEC`.
2. **`apps/api` restructured to a layer-first production layout** (user
   request): `routes → controllers → services → repositories → models`, plus
   `middlewares/`, `constants/` (global constants), `errors/`, `config/`
   (env/db/logger), `integrations/` (S3, Razorpay, notifier, KMS, token
   verifier), `helpers/`, `loaders/` (composition), `data/` (exam bank). The
   old `platform/` and `modules/` folders are dissolved. The discipline is
   unchanged: models+repositories are the only Mongoose importers; services
   hold the rules; controllers are thin; routes only declare.
3. **SEO buildout shipped in `apps/web`**: full technical layer (metadata,
   canonicals, OG/Twitter, JSON-LD Organization/WebSite/Service/FAQPage/
   BreadcrumbList, robots, sitemap) plus ~63 statically generated pages —
   `/services`, 7 `/services/[service]`, 49 `/services/[service]/[city]`
   (7 metros), and `/compliance-calendar` — all fed from `@bya/shared` domain
   data (never invented numbers). Site URL: `NEXT_PUBLIC_SITE_URL`, default
   `https://bookyouraccountant.com`.

---

## Things that will trip you up

- **SSH:** remotes must use `git@github-garp:` — plain `github.com` picks the wrong
  identity, and GitHub reports that as `Repository not found`, not a permission error.
- **`projectService: true`** means every linted TS file must belong to a tsconfig. Config
  files are exempt via `**/*.config.{js,cjs,mjs,ts}`. Anything else needs adding to the
  package's `include`.
- **`gh` is not authenticated.** Repo creation via API is unavailable; create in the
  browser, then push.
- **`apps/app` and `apps/web` have no `test` script** — deliberate. A
  `--passWithNoTests` script is a test that asserts nothing. Turbo skips packages without
  the task.
- **Two unshipped patches** sit in the legacy folder: a mobile-responsiveness pass in
  `bookyouraccountant-source-updated.zip` and `keiri-mobile.css`. Finished work, never
  applied. Carry them into the rebuild rather than redoing them.
- **Import extensions differ by package.** `packages/shared` and `apps/api` are
  `NodeNext` — relative imports need the `.js` extension. `apps/web` is Next.js
  with `moduleResolution: "Bundler"` — imports there are **extensionless**. Using
  `.js` in the web app breaks `next build` (webpack) while dev may still pass.
- **`@bya/shared` resolves to `dist/`, not `src/`.** Editing a shared file and
  re-running API tests exercises the _previous_ build. Run
  `pnpm --filter @bya/shared build`, or `pnpm test` from the root which builds
  first. A mutation-verification run once reported a false pass for exactly this.
- **The ~60 zip archives are fully analysed — do not re-extract them.** Every source file
  was hash-compared against the live trees; only the newest archive holds anything not
  already present (the mobile pass above). See `FEATURE-INVENTORY.md` §21.

---

## Resuming cold

This file loads automatically. To pick up work with no prior conversation:

1. Read this file top to bottom — the prime directive, the retention policy and
   **how to work here (vertical slices)** first.
2. `OPEN-ITEMS.md` — known gaps, ordered by when they hurt.
3. `PARITY-CHECKLIST.md` — the gate every phase must pass.
4. `FIRESTORE-RULES-PARITY.md` — which of the two lines of defence have been rebuilt.
5. `COVERAGE.md` — the blunt what's-built-vs-deferred map, incl. the 18-function tally.
6. `../BYA& Keiri/FEATURE-INVENTORY.md` — what the legacy system does. The parity contract.
7. `../docs/specs/2026-07-23-garp-architecture-design.md` §17 for phasing, §18 for the
   product questions blocking Phase 5. Phase 3's amendment to §17 is in
   `../docs/specs/2026-07-23-bya-phase3-api-auth-data.md` §1.2.

Then confirm the workspace is healthy:

```bash
pnpm install && pnpm test        # 615 passing (428 apps/api + 180 shared + 7 ui)
bash apps/api/scripts/smoke.sh   # the built API actually boots and serves
```

Everything through the integration layer is **merged to `main`** (2026-07-25).
No unmerged branches carry live work. One ceremony was deferred: a **final
whole-branch code-review** of the integration commits (the storage/notifications/
payments slices had per-task verification + a green gate + offline security
tests, but not the final adversarial pass). Run `/code-review ultra` on the
range before those paths take real money/PII in production.

To see the marketing site: `pnpm --filter @bya/web dev` → http://localhost:3000.

**Just finished:** accountant onboarding + exam walked E2E, then the third-party
integration layer — S3 storage, notifications, Razorpay payments (specs
`docs/specs/2026-07-25-{s3-storage,notifications,payments}-slice.md`). §18 product
decisions resolved (above). **All merged to `main` (2026-07-25, `d09bc14`).**

**START HERE next session → the assignment engine (§7).** It's the flagship the
§18 Q1 decision unblocks, and every dependency it needs is already built and
waiting. Read `../BYA& Keiri/FEATURE-INVENTORY.md` §7 + §8 for the lifecycle,
then brainstorm/plan a first slice. The ready seams:

- pricing: `computeQuote` (`packages/shared/src/domain/pricing.ts`, golden-verified)
- SOP: `buildSopTasks` (`packages/shared/src/domain/sop.ts`)
- payout maths: `computePayout` (`packages/shared/src/domain/payout.ts`)
- payments: `request.server.payments` (Razorpay order create) + the webhook that
  is already the **source of truth** — wire `paymentEvents` → mint a paid
  assignment (the seam P3 left as a documented TODO)
- notifications: `request.server.notifier` — add `assignment_posted`/`assigned`
  events to `NOTIFICATION_TEMPLATES` and fan out to matched accountants
- storage: `request.server.storage` — the MIS `.xlsx` upload reuses `photos`/`mis`
  scopes; `parseTemplate.js` (the one unported §19 asset) is the MIS engine

**Next actions (other slices).** Per the vertical-slice method:

- **The assignment engine (§7) — the flagship, now unblocked.** §18 Q1 resolved
  (assignments win), and payments + notifications + storage are built and waiting
  to be consumed: post (adaptive questionnaire → `computeQuote`, already ported) →
  pay (Razorpay order + the webhook that's now the source of truth) → claim
  (first-accept-wins) → SOP checklist (`buildSopTasks`, ported) → complete (work
  codes) → payout (`computePayout`, ported). This is several slices; it also
  needs the `paymentEvents`→assignment wiring the payments slice left as a seam.
- **MIS dashboard (§9)** — unblocked by the §18 Q1 decision (client list now
  derives from assignments); port `parseTemplate.js` (the one §19 asset unported).
- **Accountant KYC screen / business onboarding / Phase-4 SEO pages** — smaller,
  independent slices; KYC + business onboarding can reuse the S3 upload flow.

The marketing site's CTAs can now point at the real `/signin` (quick `apps/web`
follow-up). `apps/api/src/app.ts` is at ~299 lines — extract the composition
wiring before it needs another integration.

**Blocked on the user, not on code:**

- **Real integration credentials** — Razorpay key id/secret + webhook secret,
  WhatsApp Cloud token/phone-id, MSG91 authkey/template/sender, SMTP host/user/
  pass, and an S3 bucket + IAM (or keys). All wired with dummy values; each
  channel/gateway lights up when its env is set (AWS Secrets Manager in prod).
- **Rotate the Atlas password** — it was shared in a chat transcript, so treat it
  as disclosed. Before deploy it belongs in AWS Secrets Manager (§6.5).
- **Firebase service-account key** — `firebaseVerifier` correctly _rejects_ bad
  tokens against the real project, but no real signed-in token has ever been
  _accepted_; `checkRevoked: true` needs real credentials. Generate at Firebase
  console → Project settings → Service accounts, save **outside** the repo, point
  `GOOGLE_APPLICATION_CREDENTIALS` at it.

Keiritech is a separate repo and a separate session, by the user's decision
(2026-07-23); its plan is at `../docs/plans/2026-07-23-keiritech-rebuild.md`.

## Reference

| Document                                    | Location                                               |
| ------------------------------------------- | ------------------------------------------------------ |
| **Feature inventory — the parity contract** | `../BYA& Keiri/FEATURE-INVENTORY.md`                   |
| Architecture spec                           | `../docs/specs/2026-07-23-garp-architecture-design.md` |
| Phase 1 plan (kept in sync with every fix)  | `../docs/plans/2026-07-23-bya-monorepo-foundation.md`  |
| Legacy source (frozen)                      | `../BYA& Keiri/bya-new/`, `../BYA& Keiri/keiri-new/`   |
