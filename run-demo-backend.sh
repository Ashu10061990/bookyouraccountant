#!/usr/bin/env bash
# BYA CEO-demo backend: MongoDB replica set + API, for the ngrok tunnel to forward to.
# Run this in its OWN terminal and leave it open. ngrok runs in another terminal.
# Together they keep the APK working while the CEO tests.
set -uo pipefail

REPO="/Users/shubhamverma/Documents/Personal/GARP-Associates/bookyouraccountant"
cd "$REPO"
MONGOD="$REPO/node_modules/.cache/mongodb-memory-server/mongod-arm64-darwin-8.2.6"
DRIVER="$REPO/node_modules/.pnpm/mongodb@7.5.0/node_modules/mongodb"
DBDIR="$REPO/.mongodb-data/rs-demo"
PORT=27019

# 1) MongoDB replica set (needed for transactions: exam submit, audited writes)
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✓ mongod already listening on $PORT — reusing it."
else
  echo "→ starting mongod (replSet rs0) on $PORT ..."
  mkdir -p "$DBDIR"
  "$MONGOD" --dbpath "$DBDIR" --port $PORT --bind_ip 127.0.0.1 --replSet rs0 \
    > "$REPO/.mongodb-data/mongod-demo.log" 2>&1 &
  for _ in $(seq 1 40); do
    grep -q "Waiting for connections" "$REPO/.mongodb-data/mongod-demo.log" 2>/dev/null && break
    sleep 0.5
  done
  node -e "const {MongoClient}=require('$DRIVER');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:$PORT/?directConnection=true');await c.connect();await c.db('admin').command({replSetInitiate:{_id:'rs0',members:[{_id:0,host:'127.0.0.1:$PORT'}]}}).catch(e=>{if(e.codeName!=='AlreadyInitialized')throw e});for(let i=0;i<60;i++){const s=await c.db('admin').command({hello:1});if(s.isWritablePrimary)break;await new Promise(r=>setTimeout(r,500))}await c.close()})()"
  echo "✓ replica set ready."
fi

export MONGODB_URI="mongodb://127.0.0.1:$PORT/bya?replicaSet=rs0"
export ALLOWED_ORIGINS='http://localhost:5173,http://localhost:3000,https://localhost,capacitor://localhost'

# 2) Seed reference data (idempotent — the 7 services the app lists)
echo "→ seeding reference data ..."
pnpm --filter @bya/api seed 2>&1 | tail -2

# 3) API on :8080 (foreground — keep this terminal open)
echo "→ starting API on :8080  (leave this terminal open; Ctrl+C to stop)"
exec pnpm --filter @bya/api dev
