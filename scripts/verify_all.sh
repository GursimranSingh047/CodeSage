#!/usr/bin/env bash
# CodeSage — full verification: runs every module test suite and prints a
# combined summary. Exits non-zero if any suite fails.
set -uo pipefail
cd "$(dirname "$0")/.."

ROOT="$(pwd)"
PASS=()

echo "════════════════════════════════════════════════════"
echo " CodeSage verification — all modules"
echo "════════════════════════════════════════════════════"

echo ""
echo "▶ Module 1 — seeded vulnerable test app (own venv)"
if ( cd test-target-repo && ./venv/bin/pytest -q ); then PASS+=("1: OK"); else PASS+=("1: FAIL"); fi

echo ""
echo "▶ Modules 2–9 — backend, agents, pipeline, dashboard backend (root venv)"
if GITLEAKS_BIN="$ROOT/bin/gitleaks" ./venv/bin/pytest -q; then PASS+=("2–9: OK"); else PASS+=("2–9: FAIL"); fi

echo ""
echo "▶ Frontend build (Vite + TypeScript + Tailwind)"
if ( cd dashboard && npm run build >/dev/null 2>&1 ); then PASS+=("frontend: OK"); else PASS+=("frontend: FAIL"); fi

echo ""
echo "════════════════════════════════════════════════════"
echo " Summary"
echo "════════════════════════════════════════════════════"
status=0
for entry in "${PASS[@]}"; do
  echo "  $entry"
  [[ "$entry" == *FAIL* ]] && status=1
done
exit $status
