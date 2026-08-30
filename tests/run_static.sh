#!/usr/bin/env bash
# Static tests for pipeline
#
# If you need ingame/dynamic tests and better fakes, those tests probably don't belong here
# Use FurnitureCatalogue+FurcDev instead of this repo

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

# Paths from env vars or .env
if [[ -f "$ROOT/.env" ]]; then
  set -a; . "$ROOT/.env"; set +a
fi

LUAC="${LUAC:-$ROOT/../bin/luac}"
LUA="${LUA:-$ROOT/../bin/lua}"

for tool in "$LUAC" "$LUA"; do
  [ -x "$tool" ] || {
    echo "run_static.sh: not executable: $tool" >&2
    echo "  put lua and luac in ../bin, or set LUAC and LUA (env or .env)" >&2
    exit 2
  }
done

echo "== syntax check (luac -p) =="
find "$ROOT" -name '*.lua' -not -path '*/.git/*' -print0 \
  | xargs -0 -n1 "$LUAC" -p
echo "  ok"

echo "== data validation =="
"$LUA" "$HERE/validate_data.lua" "$ROOT"

echo "ALL STATIC CHECKS PASSED"
