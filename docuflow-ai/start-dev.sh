#!/usr/bin/env bash
#
# Starts both the DocuFlow AI backend and frontend with a single command.
#
#   ./start-dev.sh            # backend :5000  +  frontend :5173
#   ./start-dev.sh --build    # serve the production build on :4173 instead
#
# Stop both with Ctrl+C.

set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d backend/node_modules ] || [ ! -d frontend/node_modules ]; then
  echo "==> Installing dependencies (first run only)"
  npm --prefix backend install
  npm --prefix frontend install
fi

if [ ! -f backend/.env ] && [ -f backend/.env.example ]; then
  echo "==> Creating backend/.env from .env.example"
  cp backend/.env.example backend/.env
fi

PORT="${PORT:-5000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

cleanup() {
  echo ""
  echo "==> Shutting down"
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "  DocuFlow AI"
echo "  ─────────────────────────────────────────────"
echo "  Backend  : http://localhost:${PORT}/api/health"
echo "  Frontend : http://localhost:${FRONTEND_PORT}"
echo "  Demo login: demo@docuflow.ai / demo1234"
echo "  ─────────────────────────────────────────────"
echo ""

# The frontend proxies /api to this port, so it must know where the API lives.
export API_PORT="$PORT"

PORT="$PORT" npm --prefix backend start &
BACKEND_PID=$!

# Wait for the API to answer before starting the UI.
for _ in $(seq 1 40); do
  if curl -sf "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if [ "${1:-}" = "--build" ]; then
  npm --prefix frontend run build >/dev/null
  VITE_PREVIEW_PORT=4173 npm --prefix frontend run preview
else
  VITE_PORT="$FRONTEND_PORT" npm --prefix frontend run dev
fi

wait
