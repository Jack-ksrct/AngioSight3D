#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

command -v python3 >/dev/null || { echo 'Python 3.12+ is required.' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js 22+ is required.' >&2; exit 1; }
command -v pnpm >/dev/null || { echo 'Install pnpm 11.19.0 with npm install --global pnpm@11.19.0.' >&2; exit 1; }
python3 -c 'import sys; assert sys.version_info >= (3, 12), "Python 3.12+ is required"'
node -e 'const v=Number(process.versions.node.split(".")[0]); if(v<22) process.exit(1)' || { echo 'Node.js 22+ is required.' >&2; exit 1; }
[[ "$(pnpm --version)" == "11.19.0" ]] || { echo 'Use pnpm 11.19.0 to match the project lockfile.' >&2; exit 1; }

python3 -m venv "$ROOT/backend/.venv"
"$ROOT/backend/.venv/bin/python" -m pip install --upgrade pip
"$ROOT/backend/.venv/bin/python" -m pip install -r "$ROOT/backend/requirements.txt"
(cd "$ROOT/frontend" && pnpm install --frozen-lockfile)
echo 'Setup complete. Start bash scripts/unix/start-api.sh and bash scripts/unix/start-web.sh in separate terminals.'
echo 'Default training data: data/extention of Z-Alizadeh sani   dataset.xlsx'
