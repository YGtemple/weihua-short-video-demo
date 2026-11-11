#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PORT=${PORT:-8177}
export PORT
node "$ROOT/scripts/preflight.js"
BASE="http://127.0.0.1:$PORT"
if ! node -e "fetch('$BASE/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  nohup node "$ROOT/src/server/index.js" >"$ROOT/data/demo-server.log" 2>&1 &
  sleep 2
fi
URL="$BASE/?view=workflow"
printf '演示地址：%s\n' "$URL"
if command -v open >/dev/null 2>&1; then open "$URL"; fi
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 & fi
