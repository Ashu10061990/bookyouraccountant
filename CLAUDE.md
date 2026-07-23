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
- 36 states + 466 Indian cities; marketing copy; 12-entry chatbot knowledge base

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
└── keiritech/          not created yet
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

## Current state — Phase 1 complete

Scaffolding only. **No features yet, and nothing is clickable.** The SPA has one route and
a button with no handler; the API has one endpoint (`/health`).

| Package           | What                                                | Tests |
| ----------------- | --------------------------------------------------- | ----- |
| `packages/config` | eslint / tsconfig / tailwind presets                | —     |
| `packages/shared` | integer-paise money, stable API error codes         | 28    |
| `packages/ui`     | brand tokens, Tailwind preset, `Button`             | 7     |
| `apps/api`        | Fastify + typed error handler + rate limiting       | 15    |
| `apps/app`        | Vite SPA shell — also the future Capacitor bundle   | —     |
| `apps/web`        | Next.js marketing shell — metadata, robots, sitemap | —     |

CI green. 23 commits. Remote: `git@github-garp:Ashu10061990/bookyouraccountant.git`.

### Phases ahead

| Phase | Delivers                                                     |
| ----- | ------------------------------------------------------------ |
| 3     | API + MongoDB Atlas + Firebase Auth + first domain endpoints |
| 4     | Marketing pages + ~40 programmatic compliance SEO pages      |
| 5     | The product UI — **blocked** on the §18 product questions    |
| 6     | Domain-by-domain migration of live data to Atlas             |
| 7     | Capacitor → App Store / Play Store                           |

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
pnpm test         # 50 tests
pnpm lint
pnpm typecheck
pnpm build
```

Ports: API `8080`, SPA `5173`, Web `3000`.

Single package: `pnpm --filter @bya/api dev`

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

## Reference

| Document                                    | Location                                               |
| ------------------------------------------- | ------------------------------------------------------ |
| **Feature inventory — the parity contract** | `../BYA& Keiri/FEATURE-INVENTORY.md`                   |
| Architecture spec                           | `../docs/specs/2026-07-23-garp-architecture-design.md` |
| Phase 1 plan (kept in sync with every fix)  | `../docs/plans/2026-07-23-bya-monorepo-foundation.md`  |
| Legacy source (frozen)                      | `../BYA& Keiri/bya-new/`, `../BYA& Keiri/keiri-new/`   |
