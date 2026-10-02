#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ -d "$ROOT/frontend/node_modules" ]] || { echo 'Run bash scripts/unix/setup.sh first.' >&2; exit 1; }
cd "$ROOT/frontend"
exec pnpm run dev
