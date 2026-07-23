# Open technical items

Known gaps in the Phase 1 foundation. **None are blockers** — the final whole-branch review
judged the foundation sound to build Phase 3 on. Each was found by review, consciously
deferred, and recorded here rather than fixed mid-flight.

Ordered by when they start to hurt.

---

## Before Phase 3 opens

**CI never lints or typechecks repo-root files.**
`pnpm lint` / `typecheck` / `test` are `turbo run …`, and turbo's task graph only walks the
six workspaces under `apps/*` and `packages/*`. Nothing at the repo root is covered.
Root files are gated only by lint-staged, which does not run in CI and is bypassable.
_Failure:_ a `scripts/reconcile-payouts.ts` at the root is never checked by CI while the
pipeline reports green.

**Non-`AppError` 4xx responses all report `code: "BAD_REQUEST"`.**
`apps/api/src/platform/error-handler.ts` special-cases only 429 and route-404. A
plugin-thrown 401/403/409 keeps its HTTP status but carries the wrong stable code — and
the API contract tells clients to branch on `code`, not status.
_Failure:_ a client cannot distinguish "not signed in" from "malformed request".

---

## Before first real deployment

**No graceful shutdown.** `apps/api/src/server.ts` has no SIGTERM handler, so a Cloud Run
deploy drops in-flight requests. Matters as soon as payment webhooks exist.

**No env validation, no `.env.example`.** `ALLOWED_ORIGINS` and `PORT` are read ad hoc.
`.gitignore` already whitelists `.env.example`, but the file does not exist. A typo'd
origin in production fails closed to `localhost:5173`, silently.

**No pino `redact` baseline.** Full request URLs are logged. A future `?pan=ABCDE1234F`
lands in Cloud Logging in plaintext. Configure redaction paths centrally before any route
accepts PII.

**GitHub Actions pinned to major tags** (`@v4`, `@v2`) rather than commit SHAs. Acceptable
while workflows are `permissions: contents: read` with no deploy credentials. Pin to SHAs
with Dependabot before any workflow gains write permissions.

---

## Nice to have

**Brand tokens are duplicated** in `packages/ui/src/tokens.ts` and
`packages/config/tailwind/preset.js`, with no test asserting parity. All 12 colours
currently match; nothing keeps them matching. A single test comparing the two would fix
this permanently.

**Money module gaps for a marketplace.** No `subtractPaise`, so callers will write raw
`a - b` and bypass validation. No allocation/split helper for distributing a total across
platform fee + payout + GST without losing a paise to rounding. `addPaise` is variadic-only
and blows the call stack around 200k elements.

**Rate-limit regression guard is indirect.** A test asserts `buildApp()`'s instance emits
`x-ratelimit-*` headers, which would catch a revert of `await app.register(rateLimit, …)`
back to `void`. Worth confirming it still fails if someone makes that change, since that
exact defect shipped once.

---

## Resolved during Phase 1 — do not reintroduce

Six defects, all originally in the _plan_ rather than the implementation. They share one
shape: **a green gate hiding a broken artifact.** Detail in `CLAUDE.md`.

| Defect                                                                    | Now guarded by                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `void app.register(rateLimit, …)` — rate limiting silently never attached | test asserting `x-ratelimit-*` on `buildApp()`         |
| `@bya/shared` published raw `.ts` — build green, `start` crashed          | `packages/shared` emits `dist/`                        |
| `moduleResolution: "Bundler"` on Node-emitting packages                   | `NodeNext` on `shared` and `api`                       |
| Root eslint ignored `packages/**` while lint-staged linted them           | root uses the shared react preset, no ignores          |
| `formatINR` regex `/ \| /g` was a tautology stripping nothing             | `/[  ]/g`, verified against both codepoints            |
| `import/no-cycle` enabled with no TS resolver — never traversed anything  | `eslint-import-resolver-typescript` + `import/parsers` |

---

## Not technical — user decisions

Six product questions in spec §18 block Phase 5. The load-bearing one is **bookings vs
assignments**: the legacy booking flow is unreachable, which orphans the MIS financial
dashboard, `ClientUpload` and `processClientTemplate`. Until it is settled, the flagship
dashboard feature cannot work.

Also outstanding: the live Razorpay key in `../BYA& Keiri/rzp-key.csv`. The legacy app is
frozen by decision D6, so this is recorded in spec §18's accepted-risk register. It is the
one item there that does not depend on the rebuild.
