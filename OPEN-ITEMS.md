# Open technical items

Known gaps, ordered by when they start to hurt. Each was found by review or by
building on top of the thing, consciously deferred, and recorded here rather
than fixed mid-flight.

**Closed in Phase 3:** CI never linted repo-root files · non-`AppError` 4xx all
reported `BAD_REQUEST` · no graceful shutdown · no env validation or
`.env.example` · no pino `redact` baseline. Detail at the bottom.

---

## Before Phase 3 ships to an environment

**Atlas is blocked on the IP allowlist — three things to settle.**
A connection string for `cluster0.9fupu2d.mongodb.net` exists and is in
`apps/api/.env` (gitignored, commented out). Connecting fails: all three shard
hosts reject the TLS handshake, which is what Atlas does for a non-allowlisted
IP. The API runs against a local `mongod` in the meantime.

1. **Allowlist the dev IP** in Atlas > Network Access.
2. **Confirm the cluster region.** Spec §6.8 requires `ap-south-1` (Mumbai) for
   Indian data residency under the DPDP Act. A cluster created in the default
   region is a compliance problem that is far cheaper to fix while it is empty.
3. **Rotate the database password.** It was shared in a chat transcript, so it
   should be treated as disclosed. Note the same class of issue is already an
   accepted risk in spec §18 (the plaintext Razorpay key), so this is a live
   pattern rather than a hypothetical.

Also note the connection string must carry an explicit database name. The
onboarding string ends at the host, and Mongoose then silently uses `test` — the
seed would land in a database nobody looks at. `.env` uses `/bya`.

Still unproven against Atlas specifically: `mongodb+srv` DNS-seedlist
resolution, TLS, and whether `assertIndexes()` finishes inside the boot timeout
on a populated collection.

**Firebase Admin rejects bad tokens, but has never _accepted_ a real one.**
Running locally against the real `accountant-on-call` project, `firebaseVerifier`
initialises and correctly rejects a malformed token with `auth/argument-error`,
and the client sees only "Sign in to continue." — the SDK's reason never leaks.
So the wiring is proven in the negative.

The positive path is not: no real ID token from a signed-in user has ever been
accepted. That matters because `verifyIdToken(token, true)` — `checkRevoked` is
on deliberately, so a signed-out user's token dies immediately rather than at
the end of its hour — calls the Firebase Auth backend and therefore needs real
credentials. A service-account key is required:
_Firebase console > Project settings > Service accounts > Generate new private
key_, saved outside the repo, referenced by `GOOGLE_APPLICATION_CREDENTIALS`.
_Failure without it:_ every authenticated endpoint 401s while the health check
stays green. Worth a boot-time credential check before the first deploy.

**No route-level default deny.**
In Firestore, a collection with no rule is inaccessible — the `match
/{document=**} { allow read, write: if false; }` catch-all. A Node route with
no guard is wide open instead, so the analogue is per-route discipline plus
`FIRESTORE-RULES-PARITY.md`. A Fastify `onRoute` hook refusing to register any
`/v1/*` route without an explicit `preHandler` would restore fail-closed by
default, and would have caught the deliberately misconfigured route in
`auth.test.ts` at startup rather than at request time.

---

## Before first real deployment

**GitHub Actions pinned to major tags** (`@v4`, `@v2`) rather than commit SHAs.
Acceptable while workflows are `permissions: contents: read` with no deploy
credentials. Pin to SHAs with Dependabot before any workflow gains write
permissions.

**No audit log (spec §6.7).**
`PUT /v1/config/:name` records `updatedBy` on the document, which is a
stand-in, not the append-only log the spec requires. Needed before any admin
override, money transition or KYC access endpoint ships — those are statutory
records.

**No idempotency keys.** Required by §6.4 on every payment-mutating endpoint.
None exist yet because no payment endpoint does.

---

## Traps worth knowing about

**`@bya/shared` resolves to `dist/`, not `src/`.**
Editing a shared schema and re-running API tests exercises the _previous_
build. The first mutation-verification run reported a guard as decorative for
exactly this reason — the mutation had silently not applied. Run
`pnpm --filter @bya/shared build` after touching shared, or use `pnpm test`
from the root, which builds first.

**Tests now live inside each package's tsconfig.**
They used to be excluded, which forced ESLint's `projectService` to fall back
to an `allowDefaultProject` allowlist of exact paths — no wildcards, two
entries per test file, and listing a file that _is_ in a project is itself an
error. `tsconfig.build.json` keeps `dist/` test-free instead. If you add a
`scripts/` file, note it is exempt from type-aware linting by a scoped glob.

---

## Nice to have

**Brand tokens are duplicated** in `packages/ui/src/tokens.ts` and
`packages/config/tailwind/preset.js`, with no test asserting parity. All 12
colours currently match; nothing keeps them matching.

**Money module gaps for a marketplace.** No `subtractPaise`, so callers will
write raw `a - b` and bypass validation. No allocation/split helper for
distributing a total across platform fee + payout + GST without losing a paise
to rounding. `addPaise` is variadic-only and blows the call stack around 200k
elements. All three bite when the payout engine lands.

**Rate-limit tiers are flat.** One global 100/min. Spec §6.6 specifies tiered
limits — OTP 5/hour/phone, login 10/15min/IP, payment 20/hour/user. Nothing
that needs them exists yet.

**No per-role response serialisation.** Spec §6.5 requires field-level
serialisation by role so an endpoint physically cannot return bank details to
the wrong audience. Repositories return hand-built views today, which is
adequate while no PII field exists — and inadequate the moment `accountants`
lands.

---

## Resolved during Phase 1 — do not reintroduce

Six defects, all originally in the _plan_ rather than the implementation. They
share one shape: **a green gate hiding a broken artifact.** Detail in
`CLAUDE.md`.

| Defect                                                                    | Now guarded by                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `void app.register(rateLimit, …)` — rate limiting silently never attached | test asserting `x-ratelimit-*` on `buildApp()`         |
| `@bya/shared` published raw `.ts` — build green, `start` crashed          | `packages/shared` emits `dist/`                        |
| `moduleResolution: "Bundler"` on Node-emitting packages                   | `NodeNext` on `shared` and `api`                       |
| Root eslint ignored `packages/**` while lint-staged linted them           | root uses the shared react preset, no ignores          |
| `formatINR` regex `/ \| /g` was a tautology stripping nothing             | `/[  ]/g`, verified against both codepoints            |
| `import/no-cycle` enabled with no TS resolver — never traversed anything  | `eslint-import-resolver-typescript` + `import/parsers` |

## Resolved during Phase 3

| Item                                          | How                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| CI never linted repo-root files               | `pnpm lint:root` added as its own CI step — turbo only walks workspaces       |
| Non-`AppError` 4xx all reported `BAD_REQUEST` | `statusToCode` maps 401/403/404/409/429 to their real codes                   |
| No graceful shutdown                          | SIGTERM/SIGINT drain with a 10s ceiling, verified by signalling a live server |
| No env validation, no `.env.example`          | `platform/env.ts` (Zod, fails at boot) + committed `.env.example`             |
| No pino `redact` baseline                     | `platform/logger.ts`, tested by asserting secrets are absent from output      |

### Four defects found and fixed inside Phase 3

All four are the Phase 1 shape — **a green gate hiding a broken artifact** — and
none was caught by reading the code. Each was caught by deliberately breaking
something, or by running the real thing.

| Defect                                                                                                                                                                                                                                                                                                                                       | Found by                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **`server.ts` never called `connectDb()`.** The process started, `/health` said ok, and every database-backed endpoint failed with "buffering timed out after 10000ms" — Mongoose queues against a connection that never arrives instead of failing fast. All 232 tests passed, because tests open their own connection through the harness. | Booting the built artifact     |
| **`/health` returned `{status:"ok"}` unconditionally.** A server with no database looked healthy to a load balancer, which would route real traffic to it. A check that cannot fail is the same as no check. It now reports database state and 503s when disconnected — both cases pinned by tests.                                          | Same boot                      |
| The index test passed with `assertIndexes()` replaced by a no-op, because Mongoose's `autoIndex` was silently building the index. `autoIndex` is now off, which is also the correct production setting.                                                                                                                                      | Probe before trusting the test |
| The service-layer role guard was shadowed by the schema guard, so route tests stayed green with it deleted; and denial 7 observed the happy path instead of attempting the attack, so a handler honouring `?uid=` still passed.                                                                                                              | `scripts/verify-guards.sh`     |

The first two are worth dwelling on: the suite was green, CI would have been
green, and the API was completely non-functional. Only running the artifact
found it. **`pnpm build` passing is not evidence that anything works.**

`apps/api/scripts/verify-guards.sh` is the tool for the guard defects. Re-run it
after touching any guard.

---

## Not technical — user decisions

Six product questions in spec §18 block Phase 5. The load-bearing one is
**bookings vs assignments**: the legacy booking flow is unreachable, which
orphans the MIS financial dashboard, `ClientUpload` and
`processClientTemplate`. Until it is settled, the flagship dashboard feature
cannot work.

**New in Phase 3 — two service vocabularies disagree.** The seeded catalogue
has 7 ids (`bookkeeping, tax, payroll, gst, statements, advisory, audit`); the
profile matching list has 10 (`bookkeeping, gst, tds, itr, payroll, roc, audit,
advisory, einvoicing, other`). Both are ported verbatim under distinct names.
Reconciling them is spec §18 Q3, a product decision.

**`FEATURE-INVENTORY.md` §19 has an error.** It records 466 Indian cities; both
copies of the legacy `india.js` are byte-identical and contain 161. The
inventory is the parity contract, so this needs correcting at the source.

Also outstanding: the live Razorpay key in `../BYA& Keiri/rzp-key.csv`. The
legacy app is frozen by decision D6, so this is recorded in spec §18's
accepted-risk register. It is the one item there that does not depend on the
rebuild.
