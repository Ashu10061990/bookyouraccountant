#!/usr/bin/env bash
# Starts a local mongod for development on port 27018.
#
# Uses the mongod binary that mongodb-memory-server already downloaded for the
# test suite, so there is nothing to install and no Docker involved. Data
# persists in .mongodb-data/ (gitignored) so it survives restarts — unlike the
# throwaway instance the tests and smoke script use.
#
#   bash apps/api/scripts/local-db.sh          # foreground
#   bash apps/api/scripts/local-db.sh --stop   # stop it
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DATA_DIR="$REPO_ROOT/.mongodb-data"
PORT="${LOCAL_DB_PORT:-27018}"
PIDFILE="$DATA_DIR/mongod.pid"

if [ "${1:-}" = "--stop" ]; then
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    kill -TERM "$(cat "$PIDFILE")" && rm -f "$PIDFILE"
    echo "stopped"
  else
    echo "not running"
  fi
  exit 0
fi

MONGOD=$(ls "$REPO_ROOT"/node_modules/.cache/mongodb-memory-server/mongod-* 2>/dev/null | head -1)
if [ -z "$MONGOD" ]; then
  echo "No mongod binary cached. Run 'pnpm --filter @bya/api test' once to download it."
  exit 1
fi

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "already running on port $PORT (pid $(cat "$PIDFILE"))"
  exit 0
fi

mkdir -p "$DATA_DIR/db"
"$MONGOD" --dbpath "$DATA_DIR/db" --port "$PORT" --bind_ip 127.0.0.1 \
  > "$DATA_DIR/mongod.log" 2>&1 &
echo $! > "$PIDFILE"

for _ in $(seq 1 60); do
  grep -q "Waiting for connections" "$DATA_DIR/mongod.log" 2>/dev/null && break
  sleep 0.5
done

if grep -q "Waiting for connections" "$DATA_DIR/mongod.log" 2>/dev/null; then
  echo "mongod up on mongodb://127.0.0.1:$PORT  (data: .mongodb-data/db, log: .mongodb-data/mongod.log)"
else
  echo "mongod failed to start — see $DATA_DIR/mongod.log"
  exit 1
fi
