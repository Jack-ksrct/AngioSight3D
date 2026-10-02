#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON="$ROOT/backend/.venv/bin/python"
[[ -x "$PYTHON" ]] || { echo 'Run bash scripts/unix/setup.sh first.' >&2; exit 1; }
export MODEL_DIR="${MODEL_DIR:-$ROOT/models}"
export ENABLE_API_DOCS="${ENABLE_API_DOCS:-true}"
exec "$PYTHON" -m uvicorn backend.app.main:app --host 127.0.0.1 --port "${PORT:-8000}"
