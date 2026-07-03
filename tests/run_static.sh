#!/usr/bin/env bash
# Static tests for pipeline
#
# If you need ingame/dynamic tests and better fakes, those tests probably don't belong here
# Use LibFurnitureCatalogue/FurcDev instead of this repo

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

LUAC="${LUAC:-../bin/luac}"
LUA="${LUA:-../bin/lua}"

echo "== syntax check (luac -p) =="
find "$ROOT" -name '*.lua' -not -path '*/.git/*' -print0 \
  | xargs -0 -n1 "$LUAC" -p
echo "  ok"

echo "== data validation =="
"$LUA" "$HERE/validate_data.lua" "$ROOT"

echo "ALL STATIC CHECKS PASSED"
