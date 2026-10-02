#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON="$ROOT/backend/.venv/bin/python"
[[ -x "$PYTHON" ]] || { echo 'Run bash scripts/unix/setup.sh first.' >&2; exit 1; }
exec "$PYTHON" -m backend.train --data "$ROOT/data/extention of Z-Alizadeh sani   dataset.xlsx" --output "$ROOT/models" "$@"
