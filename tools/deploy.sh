#!/usr/bin/env bash
# Deploy the hive-cartographer MODULE to the remote Foundry over SSH/rsync.
# Reuses the better-dh2e system's creds.txt (line 1 "ssh root@HOST", line 2 password) so the
# secret lives only in the system repo and is never copied here. Override with HIVE_CREDS=/path.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CREDS="${HIVE_CREDS:-$ROOT/../BetterDH2/creds.txt}"
[ -f "$CREDS" ] || { echo "creds file not found: $CREDS (set HIVE_CREDS=/path/to/creds.txt)"; exit 1; }

HOST="$(sed -n '1p' "$CREDS" | awk '{print $2}')"      # e.g. root@76.13.45.240
PW_FILE="$(mktemp)"; chmod 600 "$PW_FILE"
sed -n '2p' "$CREDS" | tr -d '\n' > "$PW_FILE"
trap 'rm -f "$PW_FILE"' EXIT

DEST="/opt/foundrydata/Data/modules/hive-cartographer"
SSH="sshpass -f $PW_FILE ssh -o StrictHostKeyChecking=accept-new"

$SSH "$HOST" "mkdir -p $DEST"

# Sync only the runtime files a Foundry module needs (no node_modules/docs/test/git).
sshpass -f "$PW_FILE" rsync -az --delete -e "ssh -o StrictHostKeyChecking=accept-new" \
  "$ROOT/module.json" \
  "$ROOT/scripts" "$ROOT/templates" "$ROOT/styles" "$ROOT/lang" \
  "$HOST:$DEST/"

echo "Deployed to $HOST:$DEST"
