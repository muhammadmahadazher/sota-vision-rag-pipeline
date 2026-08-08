#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

if [[ ! -x .venv/bin/python ]]; then
  echo "Missing .venv. Run ./setup.sh first."
  exit 1
fi
if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
fi

cleanup() {
  trap - INT TERM EXIT
  kill "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true
  wait "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

(
  cd backend
  ../.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 --env-file .env
) &
BACKEND_PID=$!

npm --prefix frontend run dev -- --hostname 127.0.0.1 --port 3000 &
FRONTEND_PID=$!

echo "Aether Vision: http://127.0.0.1:3000"
echo "API docs:      http://127.0.0.1:8000/docs"
echo "Press Ctrl+C to stop both services."
wait
