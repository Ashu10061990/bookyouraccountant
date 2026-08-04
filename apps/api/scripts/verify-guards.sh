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

  # apps/api imports @bya/shared from dist/, not src/. Without this rebuild a
  # mutation to shared source has no effect at all and the run reports a false
  # pass — which is exactly what happened the first time this script was used.
  case "$file" in
    packages/shared/*) pnpm --filter @bya/shared build >/dev/null 2>&1 ;;
  esac

  local out
  out=$(pnpm --filter @bya/api test "$test_filter" -t "$test_name" 2>&1)

  git checkout -- "$file"
  case "$file" in
    packages/shared/*) pnpm --filter @bya/shared build >/dev/null 2>&1 ;;
  esac

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
  "apps/api/src/routes/config.routes.ts" "denials" "rejects a write by" \
  "sed -i '' 's/{ preHandler: \[requireAuth(deps), requireRole(\"admin\")\] },/{ preHandler: [requireAuth(deps)] },/' apps/api/src/routes/config.routes.ts"

run_mutation "D4" "config read: remove requireAuth" \
  "apps/api/src/routes/config.routes.ts" "denials" "rejects an unauthenticated read" \
  "sed -i '' 's/{ preHandler: requireAuth(deps) },//' apps/api/src/routes/config.routes.ts"

run_mutation "D6" "services write: remove requireRole('admin')" \
  "apps/api/src/routes/services.routes.ts" "denials" "rejects a create by" \
  "sed -i '' 's/{ preHandler: \[requireAuth(deps), requireRole(\"admin\")\] },/{ preHandler: [requireAuth(deps)] },/g' apps/api/src/routes/services.routes.ts"

run_mutation "D9" "leads list: remove requireRole('admin')" \
  "apps/api/src/routes/leads.routes.ts" "denials" "rejects a list by" \
  "sed -i '' 's/{ preHandler: \[requireAuth(deps), requireRole(\"admin\")\] },/{ preHandler: [requireAuth(deps)] },/' apps/api/src/routes/leads.routes.ts"

run_mutation "D12" "auth: trust the token claim instead of the database role" \
  "apps/api/src/middlewares/auth.middleware.ts" "denials" "denies a token claiming admin whose database record is not admin" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/middlewares/auth.middleware.ts';let s=fs.readFileSync(p,'utf8');
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
  "apps/api/src/middlewares/auth.middleware.ts" "denials" "rejects a forged token" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/middlewares/auth.middleware.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('    request.log.warn({ err: error }, \\\"token verification failed\\\");\n    throw unauthenticated();',
            '    request.log.warn({ err: error }, \\\"token verification failed\\\");\n    request.tokenUid = \\\"uid-admin\\\";');
fs.writeFileSync(p,s);
\""

run_mutation "D2/D8" "leads: key the write to the body uid instead of the token" \
  "apps/api/src/controllers/leads.controller.ts" "denials" "ignores a body-supplied uid and writes only the caller" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/controllers/leads.controller.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('return { lead: await service.upsertOwnLead(tokenUidOf(request), input) };',
            'const b = request.body as {firebaseUid?: string};\n    return { lead: await service.upsertOwnLead(b.firebaseUid ?? tokenUidOf(request), input) };');
fs.writeFileSync(p,s);
\""

run_mutation "D1/D3" "users: allow admin as a self-assignable role (both layers)" \
  "packages/shared/src/schemas/user.ts" "denials" "rejects role: admin at creation" \
  "sed -i '' 's/export const SELF_ASSIGNABLE_ROLES = \[\"business\", \"accountant\"\] as const;/export const SELF_ASSIGNABLE_ROLES = [\"business\", \"accountant\", \"admin\"] as const;/' packages/shared/src/schemas/user.ts"

# The service-layer half of the role guard is shadowed by the schema at the
# route level, so it needs its own direct-call test to be provable.
run_mutation "D1/D3b" "users: remove the service-layer assertSelfAssignable" \
  "apps/api/src/services/users.service.ts" "users.service" "refuses to create an admin" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/services/users.service.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('function assertSelfAssignable(role: string | undefined): void {',
            'function assertSelfAssignable(role: string | undefined): void { return;');
fs.writeFileSync(p,s);
\""

# ---------------------------------------------------------------------------
# Phase 3 follow-up: accountants, businesses, KYC and the audit log
# ---------------------------------------------------------------------------

run_mutation "A1" "accountants: allow a profile to arrive verified" \
  "apps/api/src/services/accountants.service.ts" "accountants" "refuses a profile that tries to arrive verified" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/services/accountants.service.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('function assertNoServerOwnedFields(payload: unknown): void {',
            'function assertNoServerOwnedFields(payload: unknown): void { return;');
fs.writeFileSync(p,s);
\""

run_mutation "A2" "accountants: leak contact details in the public view" \
  "apps/api/src/helpers/accountants.serializer.ts" "accountants.serializer" "omits the email" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/helpers/accountants.serializer.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('    verified: document.verified,',
            '    email: document.email, phone: document.phone,\n    verified: document.verified,');
fs.writeFileSync(p,s);
\""

run_mutation "A3" "accountants: give every signed-in user the private view" \
  "apps/api/src/helpers/accountants.serializer.ts" "accountants.serializer" "gives another signed-in user the public view" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/helpers/accountants.serializer.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('  return isOwner || isAdmin ? privateView(document) : publicView(document);',
            '  return privateView(document);');
fs.writeFileSync(p,s);
\""

run_mutation "A4" "accountants: let a non-admin read decrypted KYC" \
  "apps/api/src/services/accountants.service.ts" "accountants.service" "refuses the accountant reading their own, reached directly" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/services/accountants.service.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace(\\\"  if (ctx.role !== 'admin') {\\n    throw forbidden('Only an administrator may read full KYC details.');\\n  }\\\", '');
s=s.replace('    throw forbidden(\\\"Only an administrator may read full KYC details.\\\");','');
fs.writeFileSync(p,s);
\""

run_mutation "A5" "accountants: skip the audit entry on a KYC read" \
  "apps/api/src/services/accountants.service.ts" "accountants" "writes an audit entry naming the admin who read it" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/services/accountants.service.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('  await record({', '  await Promise.resolve({');
fs.writeFileSync(p,s);
\""

run_mutation "B1" "businesses: let any signed-in user read a business" \
  "apps/api/src/services/businesses.service.ts" "businesses.service" "refuses another business reached directly" \
  "perl -0pi -e 's/if \\(ctx\\.uid !== subjectUid && ctx\\.role !== \"admin\"\\)/if (false)/' apps/api/src/services/businesses.service.ts"

run_mutation "B2" "businesses: allow the org PAN through the profile update path" \
  "apps/api/src/services/businesses.service.ts" "businesses" "cannot be set or cleared through the profile update path" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/services/businesses.service.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('function assertNoServerOwnedFields(payload: unknown): void {',
            'function assertNoServerOwnedFields(payload: unknown): void { return;');
fs.writeFileSync(p,s);
\""

run_mutation "C1" "crypto: store the PAN in plaintext instead of sealing it" \
  "apps/api/src/services/accountants.service.ts" "accountants" "stores the PAN encrypted, never in plaintext" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/services/accountants.service.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('          panMasked: maskPan(input.pan),','          panMasked: input.pan,');
fs.writeFileSync(p,s);
\""

run_mutation "D1" "audit: break the transaction so a failed action still records" \
  "apps/api/src/services/audit.service.ts" "audit" "rolls the change back when the work throws" \
  "node -e \"
const fs=require('fs');const p='apps/api/src/services/audit.service.ts';let s=fs.readFileSync(p,'utf8');
s=s.replace('    await session.withTransaction(async () => {','    await (async () => {');
s=s.replace('    });\n\n    return outcome.result;','    })();\n\n    return outcome.result;');
fs.writeFileSync(p,s);
\""

# ---------------------------------------------------------------------------
# Exam engine (§11): the answer key and server-side scoring
# ---------------------------------------------------------------------------

run_mutation "E1" "exam: trust the client's session ownership claim" \
  "apps/api/src/services/exams.service.ts" "exams" "rejects a submission for someone else" \
  "perl -0pi -e 's/if \\(stored\\.ownerId !== ctx\\.uid\\) throw forbidden\\(.That exam session is not yours\\..\\);/if (false) throw forbidden(\"x\");/' apps/api/src/services/exams.service.ts"

run_mutation "E2" "exam: skip the attempt throttle" \
  "apps/api/src/services/exams.service.ts" "exams" "blocks a third start after two recent fails" \
  "perl -0pi -e 's/await assertNotThrottled\\(ctx\\.uid, now\\);//' apps/api/src/services/exams.service.ts"

run_mutation "E3" "exam: let a used session be re-scored (break idempotency)" \
  "apps/api/src/services/exams.service.ts" "exams" "is idempotent" \
  "perl -0pi -e 's/if \\(stored\\.used\\) \\{/if (false) {/' apps/api/src/services/exams.service.ts"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "=== all $PASS guards proven load-bearing ==="
else
  echo "=== $PASS guards proven load-bearing, $FAIL DECORATIVE — fix them ==="
fi
exit "$FAIL"
