#!/usr/bin/env bash
#
# local-dev wrapper around release pipeline scripts. It puts the zip in the .package/
#
# Usage:
#  ./build.sh                          regen autocomplete + locales + stylua format
#  ./build.sh --release                bump current ESOUI version + package
#  ./build.sh --release X.Y.Z          bump to version + package
#  ./build.sh --release [...] --publish    + upload .package/<zip> to ESOUI
#  ./build.sh --release [...] --publish --dry-run  + that upload, but not for real
#  ./build.sh --help                   this message
#
# Setup:
#   - python3 with libs from scripts/requirements.txt
#       (pip install -r scripts/requirements.txt)
#   - StyLua is auto-fetched (pinned to the CI version) by scripts/stylua.sh
#   - Optional .env file in repo root, see scripts/env.example

set -euo pipefail

# ------------------------------------------
# locate repo root (one dir up from scripts)
# ------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ------------------------------------------
# load optional .env (same file the tests read)
# ------------------------------------------
if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a; . "$REPO_ROOT/.env"; set +a
fi

# ------------------------------------------
# args
# ------------------------------------------
DO_RELEASE=0
RELEASE_VERSION=""
DO_PUBLISH=0
DO_DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      DO_RELEASE=1
      # Version optional. If set MUST be a valid X.Y.Z version
      if [[ -n "${2:-}" && "$2" != --* ]]; then
        if [[ "$2" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
          RELEASE_VERSION="$2"; shift 2
        else
          echo "🔥 --release got invalid version: '$2' (expected X.Y.Z or omit for auto bump)" >&2
          exit 2
        fi
      else
        shift
      fi
      ;;
    --publish) DO_PUBLISH=1; shift ;;
    --dry-run) DO_DRY_RUN=1; shift ;;
    -h|--help) awk 'NR>=3 {if (/^[^#]/ && !/^$/) exit; print}' "$0"; exit 0 ;;
    *) echo "unknown flag: $1 (use --help)" >&2; exit 2 ;;
  esac
done

if [[ "$DO_PUBLISH" == 1 && "$DO_RELEASE" == 0 ]]; then
  echo "🔥 --publish requires --release (we need a packaged zip to upload)" >&2
  exit 2
fi

if [[ "$DO_DRY_RUN" == 1 && "$DO_PUBLISH" == 0 ]]; then
  echo "🔥 --dry-run only means something with --publish (it picks the ESOUI test endpoint)" >&2
  exit 2
fi

# ------------------------------------------
# check tool paths
# ------------------------------------------
PY="${PYTHON3_BIN:-python3}"
command -v "$PY" >/dev/null || { echo "🔥 python3 not found ($PY). Set PYTHON3_BIN in .env if needed." >&2; exit 1; }

# ------------------------------------------
# 1. regen autocomplete defs + translations
# ------------------------------------------
echo "[build] regenerate autocomplete defs"
"$PY" scripts/luaDoc_generateStr.py LibFurnitureCatalogue/locale/en.lua

echo "[build] regenerate translation files"
for langfile in LibFurnitureCatalogue/locale/*.lua; do
  [[ "$langfile" == "LibFurnitureCatalogue/locale/en.lua" ]] && continue
  "$PY" scripts/luaDoc_generateStr.py LibFurnitureCatalogue/locale/en.lua "$langfile" --generate-translation
done

# ------------------------------------------
# 2. stylua format
# ------------------------------------------
echo "[build] stylua format (pinned version via stylua.sh)"
scripts/stylua.sh

# ------------------------------------------
# 3. release: bump + package
# ------------------------------------------
if [[ "$DO_RELEASE" == 0 ]]; then
  echo "[build] ✅ done (regen + format)."
  exit 0
fi

if [[ -z "$RELEASE_VERSION" ]]; then
  # reading the live version is an API call, and ESOUI wants the token on every endpoint
  : "${ESOUI_API_TOKEN:?🔥 ESOUI_API_TOKEN not set, needed to read the live version (or pass --release X.Y.Z)}"
  echo "[build] no version given - auto bumping minor version"
  LIVE="$("$PY" scripts/esoui_utils.py version)"
  RELEASE_VERSION="$("$PY" scripts/furc_utils.py nextversion --current "$LIVE")"
  echo "[build] LIVE=$LIVE → NEXT=$RELEASE_VERSION"
fi

echo "[build] bump manifest + LibFurnitureCatalogue.lua to $RELEASE_VERSION"
CHANGED_TMP="$(mktemp)"
"$PY" scripts/furc_utils.py changeversion --new-version "$RELEASE_VERSION" --output-file "$CHANGED_TMP"
rm -f "$CHANGED_TMP"

echo "[build] package zip"
"$PY" scripts/package.py
ZIP="$(ls -1 *.zip | head -1)"
test -s "$ZIP" || { echo "🔥 package.py produced no zip" >&2; exit 1; }

# package.py only wipes .package/build, so previous zips here survive
mkdir -p .package
mv "$ZIP" ".package/$ZIP"
echo "[build] ✅ release ready: .package/$ZIP"

# ------------------------------------------
# 4. publish (optional)
# ------------------------------------------
if [[ "$DO_PUBLISH" == 1 ]]; then
  : "${ESOUI_API_TOKEN:?🔥 ESOUI_API_TOKEN not set (export it or put it in .env)}"
  PUBLISH_ARGS=( --changelog-max-entries 15 --archive-file ".package/$ZIP" --print-response )
  if [[ "$DO_DRY_RUN" == 1 ]]; then
    PUBLISH_ARGS+=( --test ) # publish.py names the endpoint it posts to, not the intent
    echo "[build] dry run: posting .package/$ZIP to the ESOUI test endpoint"
  else
    echo "[build] publish .package/$ZIP to ESOUI"
  fi
  "$PY" scripts/publish.py "${PUBLISH_ARGS[@]}"
  [[ "$DO_DRY_RUN" == 1 ]] && echo "[build] ✅ dry run done, listing untouched" || echo "[build] ✅ published"
fi
