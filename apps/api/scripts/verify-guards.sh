#!/usr/bin/env bash
# Mutation verification for the denial suite.
#
# For each guard: break it, run the test that is supposed to catch it, and
# confirm that test FAILS. A guard whose test passes with the guard removed is
# decorative. Every file is restored from git afterwards.
set -uo pipefail
cd "/Users/shubhamverma/Documents/Personal/GARP-Associates/bookyouraccountant"

PASS=0
FAIL=0

run_mutation() {
  local id="$1" desc="$2" file="$3" test_filter="$4" test_name="$5"
  shift 5
  # Remaining args are the sed/node mutation command, run via eval.
  local mutation="$*"

  eval "$mutation"

  local out
  out=$(pnpm --filter @bya/api test "$test_filter" -t "$test_name" 2>&1)

  git checkout -- "$file"

  if echo "$out" | grep -qE "Tests +[0-9]+ failed|FAIL "; then
    echo "  [OK]   $id  $desc"
    echo "         -> test correctly FAILED when the guard was removed"
    PASS=$((PASS + 1))
  else
    echo "  [WEAK] $id  $desc"
    echo "         -> test STILL PASSED without the guard. It proves nothing."
    echo "$out" | grep -E "Tests |Test Files" | sed 's/^/         /'
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Mutation verification of the denial suite ==="
echo

run_mutation "D5" "config write: remove requireRole('admin')" \
  "apps/api/src/modules/config/config.routes.ts" "denials" "rejects a write by" \
  "sed -i '' 's/{ preHandler: \[requireAuth(deps), requireRole(\"admin\")\] },/{ preHandler: [requireAuth(deps)] },/' apps/api/src/modules/config/config.routes.ts"

run_mutation "D4" "config read: remove requireAuth" \
  "apps/api/src/modules/config/config.routes.ts" "denials" "rejects an unauthenticated read" \
  "sed -i '' 's/{ preHandler: requireAuth(deps) },//' apps/api/src/modules/config/config.routes.ts"

run_mutation "D6" "services write: remove requireRole('admin')" \
  "apps/api/src/modules/services/services.routes.ts" "denials" "rejects a create by" \
  "sed -i '' 's/{ preHandler: \[requireAuth(deps), requireRole(\"admin\")\] },/{ preHandler: [requireAuth(deps)] },/g' apps/api/src/modules/services/services.routes.ts"

run_mutation "D9" "leads list: remove requireRole('admin')" \
  "apps/api/src/modules/leads/leads.routes.ts" "denials" "rejects a list by" \
  "sed -i '' 's/{ preHandler: \[requireAuth(deps), requireRole(\"admin\")\] },/{ preHandler: [requireAuth(deps)] },/' apps/api/src/modules/leads/leads.routes.ts"

run_mutation "D12" "auth: trust the token claim instead of the database role" \
  "apps/api/src/platform/auth.ts" "denials" "denies a token claiming admin whose database record is not admin" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/platform/auth.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('request.ctx = { uid, role: user.role, blocked: user.blocked };',
            'request.ctx = { uid, role: (request.tokenUid, verifiedClaims(request)) ?? user.role, blocked: user.blocked };');
s=s.replace('/** Verifies the bearer token and records the uid. Shared by both guards. */',
            'function verifiedClaims(r){return r.__claims?.role;}\n/** shim */');
s=s.replace('request.tokenUid = verified.uid;','request.tokenUid = verified.uid; r_claims(request, verified);');
s=s.replace('async function verifyToken(verifier: TokenVerifier, request: FastifyRequest): Promise<void> {',
            'function r_claims(r,v){r.__claims=v.claims;}\nasync function verifyToken(verifier: TokenVerifier, request: FastifyRequest): Promise<void> {');
fs.writeFileSync(p,s);
\""

run_mutation "D10" "auth: stop rejecting an unverifiable token" \
  "apps/api/src/platform/auth.ts" "denials" "rejects a forged token" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/platform/auth.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('    request.log.warn({ err: error }, \\\"token verification failed\\\");\n    throw unauthenticated();',
            '    request.log.warn({ err: error }, \\\"token verification failed\\\");\n    request.tokenUid = \\\"uid-admin\\\";');
fs.writeFileSync(p,s);
\""

run_mutation "D2/D8" "leads: key the write to the body uid instead of the token" \
  "apps/api/src/modules/leads/leads.routes.ts" "denials" "ignores a body-supplied uid and writes only the caller" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/modules/leads/leads.routes.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('return { lead: await service.upsertOwnLead(tokenUidOf(request), input) };',
            'const b = request.body as {firebaseUid?: string};\n    return { lead: await service.upsertOwnLead(b.firebaseUid ?? tokenUidOf(request), input) };');
fs.writeFileSync(p,s);
\""

run_mutation "D1/D3" "users: allow admin as a self-assignable role (both layers)" \
  "packages/shared/src/schemas/user.ts" "denials" "rejects role: admin at creation" \
  "sed -i '' 's/export const SELF_ASSIGNABLE_ROLES = \[\"business\", \"accountant\"\] as const;/export const SELF_ASSIGNABLE_ROLES = [\"business\", \"accountant\", \"admin\"] as const;/' packages/shared/src/schemas/user.ts"

echo
echo "=== $PASS guards proven load-bearing, $FAIL decorative ==="
