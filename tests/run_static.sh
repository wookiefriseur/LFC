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

# bin/ in the repo is the documented spot, ../bin next to it still works
LUAC="${LUAC:-}"
LUA="${LUA:-}"
for dir in "$ROOT/bin" "$ROOT/../bin"; do
  [ -z "$LUAC" ] && [ -x "$dir/luac" ] && LUAC="$dir/luac"
  [ -z "$LUA" ] && [ -x "$dir/lua" ] && LUA="$dir/lua"
done

for tool in "$LUAC" "$LUA"; do
  [ -n "$tool" ] && [ -x "$tool" ] || {
    echo "run_static.sh: no usable lua/luac found" >&2
    echo "  put them in bin/, or set LUAC and LUA (env or .env)" >&2
    exit 2
  }
done

echo "== syntax check (luac -p) =="
FILES=$(find -H "$ROOT" -name '*.lua' -not -path '*/.git/*' | wc -l)
[ "$FILES" -gt 0 ] || { echo "run_static.sh: no .lua files under $ROOT" >&2; exit 2; }
find -H "$ROOT" -name '*.lua' -not -path '*/.git/*' -print0 \
  | xargs -0 -n1 "$LUAC" -p
echo "  ok: $FILES files"

echo "== constants validation =="
"$LUA" "$HERE/validate_constants.lua" "$ROOT/LibFurnitureCatalogue"

echo "== locale validation =="
"$LUA" "$HERE/validate_locale.lua" "$ROOT/LibFurnitureCatalogue" "$LUAC"

echo "== data validation =="
"$LUA" "$HERE/validate_data.lua" "$ROOT/LibFurnitureCatalogue" "$LUAC"

echo "== record field validation =="
"$LUA" "$HERE/validate_record_fields.lua" "$ROOT/LibFurnitureCatalogue"

echo "== source model validation =="
"$LUA" "$HERE/validate_source_model.lua" "$ROOT/LibFurnitureCatalogue"

echo "== public API surface =="
"$LUA" "$HERE/validate_api_surface.lua" "$ROOT/LibFurnitureCatalogue"

echo "ALL STATIC CHECKS PASSED"
