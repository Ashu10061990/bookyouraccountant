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

## Current state — Phase 3 complete (API layer)

The API is real: authenticated, database-backed, 11 endpoints across 4 domains.
**No UI yet** — the SPA is still the Phase 1 shell.

| Package           | What                                                         | Tests |
| ----------------- | ------------------------------------------------------------ | ----- |
| `packages/config` | eslint / tsconfig / tailwind presets                         | —     |
| `packages/shared` | money, error codes, Zod schemas, §19 reference data          | 64    |
| `packages/ui`     | brand tokens, Tailwind preset, `Button`                      | 7     |
| `apps/api`        | Fastify + Mongoose + Firebase Auth + 6 modules + KYC + audit | 318   |
| `apps/app`        | Vite SPA shell — also the future Capacitor bundle            | —     |
| `apps/web`        | Next.js marketing shell — metadata, robots, sitemap          | —     |

Every package emits `dist/`. A package that ships TypeScript source pushes its
build problem onto every consumer — see the `@bya/ui` row below.

`apps/web` dev uses **Turbopack** (`next dev --turbopack`). Webpack's dev
runtime fails on this machine; detail in `OPEN-ITEMS.md`.

473 tests, CI green. Remote: `git@github-garp:Ashu10061990/bookyouraccountant.git`.

### What Phase 3 delivered

- **`platform/`** — Zod-validated env, Mongoose with fail-loud index assertion, the
  `TokenVerifier` port, pino redaction, stable 4xx codes, SIGTERM draining.
- **Four modules** — `services`, `users`, `leads`, `config`, each
  `routes → service → repository → schema`.
- **The security layer** — 29 denial tests in `apps/api/src/security/denials.test.ts`,
  every guard mutation-verified. See `FIRESTORE-RULES-PARITY.md`.
- **§19 reference data** — 4 of 12 assets ported verbatim into `packages/shared`.

**Phase 3 + follow-up delivered:** the four platform modules, plus the audit log
(§6.7), envelope encryption (§6.5), and the `accountants` and `businesses`
modules. The §18 accepted risk (accountant bank details world-readable) is no
longer reproduced — see `OPEN-ITEMS.md`.

**Pure domain logic ported (§19):** the pricing engine (`computeQuote`), SOP
templates (`buildSopTasks`), payout statutory maths (`computePayout`) and the
first-day-free coupon now live in `packages/shared/src/domain/`, each proven
byte-for-byte against golden vectors captured from the frozen legacy.

**Deferred, recorded, not dropped:** the assignment _lifecycle_ and wizard (§7,
UI blocked on §18 Q1), payments/Razorpay wiring (§12), and the compliance calendar data (§10).
See `OPEN-ITEMS.md`.

### Phases ahead

| Phase | Delivers                                                  |
| ----- | --------------------------------------------------------- |
| 3+    | `accountants` + `businesses` + KYC encryption + audit log |
| 4     | Marketing pages + ~40 programmatic compliance SEO pages   |
| 5     | The product UI — **blocked** on the §18 product questions |
| 6     | Domain-by-domain migration of live data to Atlas          |
| 7     | Capacitor → App Store / Play Store                        |

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
pnpm test         # 473 tests
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
and surfaces only as data corruption.

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

---

## Open product questions — these block Phase 5

From spec §18. Not technical calls; the user must decide:

1. **Bookings vs assignments.** The legacy booking flow is unreachable, which orphans the
   MIS dashboard, `ClientUpload` and `processClientTemplate`. Until this is settled, the
   flagship financial-dashboard feature cannot work. **Highest priority.**
2. Restore the accountant browse marketplace, or commit to post-and-claim?
3. Seed the six missing services, or become bookkeeping-only? (`FALLBACK_SERVICES` has one
   entry; the pricing engine, SOP templates and booking validator all define seven.)
4. Keiritech and BYA — separate brands or one?
5. Keep the built-but-unshipped course and account-head SOP?
6. Redesign, or feature parity first?

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
- **The ~60 zip archives are fully analysed — do not re-extract them.** Every source file
  was hash-compared against the live trees; only the newest archive holds anything not
  already present (the mobile pass above). See `FEATURE-INVENTORY.md` §21.

---

## Resuming cold

This file loads automatically. To pick up work with no prior conversation:

1. Read this file top to bottom — the prime directive and retention policy first.
2. `OPEN-ITEMS.md` — known gaps, ordered by when they hurt.
3. `PARITY-CHECKLIST.md` — the gate every phase must pass.
4. `FIRESTORE-RULES-PARITY.md` — which of the two lines of defence have been rebuilt.
5. `../BYA& Keiri/FEATURE-INVENTORY.md` — what the legacy system does. The parity contract.
6. `../docs/specs/2026-07-23-garp-architecture-design.md` §17 for phasing, §18 for the
   product questions blocking Phase 5. Phase 3's amendment to §17 is in
   `../docs/specs/2026-07-23-bya-phase3-api-auth-data.md` §1.2.

Then: `pnpm install && pnpm test` (expect 473 passing) to confirm the workspace is healthy.

**Next actions, in the order they unblock things:**

- Settle spec §18 — especially **bookings vs assignments**, which decides whether the MIS
  dashboard can exist at all. Blocks Phase 5.
- Point the API at a real Atlas cluster. Everything is tested against
  `mongodb-memory-server`; nothing has touched Atlas or verified a real Firebase token.
  First item in `OPEN-ITEMS.md`.
- Phase 3 follow-up: `accountants` + `businesses`, which need KYC envelope encryption
  (§6.5) and the audit log (§6.7) first.
- Keiritech — the folder exists on disk with its own plan at
  `../docs/plans/2026-07-23-keiritech-rebuild.md`. Handled in a separate session by the
  user's decision, 2026-07-23.

## Reference

| Document                                    | Location                                               |
| ------------------------------------------- | ------------------------------------------------------ |
| **Feature inventory — the parity contract** | `../BYA& Keiri/FEATURE-INVENTORY.md`                   |
| Architecture spec                           | `../docs/specs/2026-07-23-garp-architecture-design.md` |
| Phase 1 plan (kept in sync with every fix)  | `../docs/plans/2026-07-23-bya-monorepo-foundation.md`  |
| Legacy source (frozen)                      | `../BYA& Keiri/bya-new/`, `../BYA& Keiri/keiri-new/`   |
