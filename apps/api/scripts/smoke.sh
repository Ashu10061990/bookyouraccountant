#!/usr/bin/env bash
# End-to-end smoke test of the BUILT artifact against a REAL mongod.
#
# This exists because a full green pipeline — tests, lint, typecheck, build —
# once coexisted with an API that could not serve a single database-backed
# request: server.ts was missing its connectDb() call, and every test opened its
# own connection through the test harness, so nothing noticed. Only starting the
# thing and calling it found that.
#
#   pnpm --filter @bya/api build && bash apps/api/scripts/smoke.sh
#
# Uses the mongod binary that mongodb-memory-server already downloaded, so it
# needs no Atlas credentials and no Docker.
set -uo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$API_DIR/../.." && pwd)"
WORK="$(mktemp -d)"
PORT="${SMOKE_PORT:-8096}"
MONGO_PORT="${SMOKE_MONGO_PORT:-37021}"
URI="mongodb://127.0.0.1:${MONGO_PORT}/bya-smoke"

FAILURES=0
check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    echo "  ok    $1 ($3)"
  else
    echo "  FAIL  $1 — expected $2, got $3"
    FAILURES=$((FAILURES + 1))
  fi
}

cleanup() {
  [ -n "${API_PID:-}" ] && kill -TERM "$API_PID" 2>/dev/null
  [ -n "${MONGO_PID:-}" ] && kill -TERM "$MONGO_PID" 2>/dev/null
  wait 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

if [ ! -f "$API_DIR/dist/server.js" ]; then
  echo "dist/server.js not found. Run: pnpm --filter @bya/api build"
  exit 1
fi

MONGOD=$(ls "$REPO_ROOT"/node_modules/.cache/mongodb-memory-server/mongod-* 2>/dev/null | head -1)
if [ -z "$MONGOD" ]; then
  echo "No mongod binary cached. Run the test suite once to download it."
  exit 1
fi

mkdir -p "$WORK/db"
"$MONGOD" --dbpath "$WORK/db" --port "$MONGO_PORT" --bind_ip 127.0.0.1 > "$WORK/mongod.log" 2>&1 &
MONGO_PID=$!
for _ in $(seq 1 60); do
  grep -q "Waiting for connections" "$WORK/mongod.log" 2>/dev/null && break
  sleep 0.5
done

echo "== seed =="
# Run from the package directory: tsx and the workspace deps resolve from there.
( cd "$API_DIR" && MONGODB_URI="$URI" node --import tsx src/scripts/seed.ts 2>&1 | tail -1 )

echo "== boot dist/server.js =="
MONGODB_URI="$URI" PORT="$PORT" LOG_LEVEL=warn node "$API_DIR/dist/server.js" > "$WORK/api.log" 2>&1 &
API_PID=$!
for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 0.25
done

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "== checks =="
check "health is 200 with a live database" 200 "$(code "http://127.0.0.1:$PORT/health")"
check "health reports connected" "connected" \
  "$(curl -s "http://127.0.0.1:$PORT/health" | sed -n 's/.*"database":"\([^"]*\)".*/\1/p')"
check "public catalogue serves 7 services" 7 \
  "$(curl -s "http://127.0.0.1:$PORT/v1/services" | grep -o '"id":' | wc -l | tr -d ' ')"
check "config denies anonymous" 401 "$(code "http://127.0.0.1:$PORT/v1/config/platformFees")"
check "forged token denied" 401 \
  "$(code -H 'Authorization: Bearer forged' "http://127.0.0.1:$PORT/v1/users/me")"
check "unknown route 404s" 404 "$(code "http://127.0.0.1:$PORT/nope")"
check "rate limiting is attached" "100" \
  "$(curl -s -D- -o /dev/null "http://127.0.0.1:$PORT/v1/services" \
     | grep -i 'x-ratelimit-limit' | tr -d '\r' | awk '{print $2}')"

echo "== seed is idempotent =="
SECOND=$( cd "$API_DIR" && MONGODB_URI="$URI" node --import tsx src/scripts/seed.ts 2>&1 | tail -1 )
echo "  $SECOND"
case "$SECOND" in *"0 created"*) echo "  ok    second run created nothing" ;;
  *) echo "  FAIL  second seed run was not idempotent"; FAILURES=$((FAILURES + 1)) ;;
esac

echo "== SIGTERM drains cleanly =="
kill -TERM "$API_PID"; wait "$API_PID"; EXIT_CODE=$?
API_PID=""
check "clean exit after SIGTERM" 0 "$EXIT_CODE"

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "smoke: all checks passed"
else
  echo "smoke: $FAILURES check(s) FAILED"
fi
exit "$FAILURES"
