#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON="$ROOT/backend/.venv/bin/python"
[[ -x "$PYTHON" ]] || { echo 'Run bash scripts/unix/setup.sh first.' >&2; exit 1; }
"$PYTHON" -m backend.train --data "$ROOT/data/extention of Z-Alizadeh sani   dataset.xlsx" --output "$ROOT/models" "$@"
# Optional angiography branch: set CADICA_ZIP=/path/to/cadica.zip to build it too.
if [[ -n "${CADICA_ZIP:-}" ]]; then
  "$PYTHON" -m backend.train_angiography --zip "$CADICA_ZIP" --output "$ROOT/models"
fi
