#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

PROFILE="requirements.txt"
if [[ "${1:-}" == "--advanced" ]]; then
  PROFILE="requirements-advanced.txt"
fi

command -v node >/dev/null 2>&1 || { echo "Node.js 20+ is required."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Python 3.12+ is required."; exit 1; }
python3 -c "import sys; raise SystemExit(sys.version_info < (3, 12))"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r "backend/$PROFILE"
npm ci --prefix frontend

if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
fi

echo
echo "Aether Vision is ready (${PROFILE})."
echo "Run ./run.sh, or use 'docker compose up --build' for the full stack."
