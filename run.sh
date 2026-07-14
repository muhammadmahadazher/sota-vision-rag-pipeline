#!/bin/bash

# 1. Verify environment configuration
ENV_PATH="backend/.env"

if [ ! -f "$ENV_PATH" ]; then
    echo "[STATUS] Creating backend/.env from boilerplate..."
    echo "QDRANT_URL=http://localhost:6333" > "$ENV_PATH"
    echo "GEMINI_API_KEY=" >> "$ENV_PATH"
    chmod 600 "$ENV_PATH"
fi

# Load existing values
if [ -f "$ENV_PATH" ]; then
    # We read manually to handle potential spaces and avoid syntax issues
    GEMINI_KEY=$(grep -E "^GEMINI_API_KEY=" "$ENV_PATH" | cut -d'=' -f2- | tr -d '"' | xargs)
fi

# 2. Prompt user for GEMINI_API_KEY only once if missing
if [ -z "$GEMINI_KEY" ]; then
    echo
    echo "=================================================="
    echo "[PROMPT] AETHER VISION RAG: GEMINI_API_KEY Required"
    echo "=================================================="
    read -p "Please enter your GEMINI_API_KEY: " USER_KEY
    
    # Write environment variables
    echo "QDRANT_URL=http://localhost:6333" > "$ENV_PATH"
    echo "GEMINI_API_KEY=$USER_KEY" >> "$ENV_PATH"
    chmod 600 "$ENV_PATH"
    GEMINI_KEY="$USER_KEY"
fi

# 3. Force standalone Qdrant URL internally
# Ensure QDRANT_URL is hardcoded to port 6333
grep -v "QDRANT_URL" "$ENV_PATH" > "${ENV_PATH}.tmp"
echo "QDRANT_URL=http://localhost:6333" >> "${ENV_PATH}.tmp"
mv "${ENV_PATH}.tmp" "$ENV_PATH"
chmod 600 "$ENV_PATH"

# Load backend/.env environment variables to current shell
export QDRANT_URL="http://localhost:6333"
export GEMINI_API_KEY="$GEMINI_KEY"
export QDRANT__STORAGE__STORAGE_PATH="database/data"

echo "=================================================="
echo "AETHER VISION RAG - LAUNCHING SERVICES"
echo "=================================================="

# 4. Start Qdrant Standalone Binary
echo "[STATUS] Launching Qdrant Database (Port 6333)..."
if [ ! -f "database/bin/qdrant" ]; then
    echo "[ERROR] Qdrant binary not found. Please run ./setup.sh first."
    exit 1
fi
database/bin/qdrant &
QDRANT_PID=$!

# 5. Start FastAPI Backend
echo "[STATUS] Launching FastAPI Backend (Port 8000)..."
source .venv/bin/activate
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
cd ..

# 6. Start Next.js Frontend
echo "[STATUS] Launching Next.js Frontend (Port 3000)..."
cd frontend
npm run dev -- --port 3000 &
FRONTEND_PID=$!
cd ..

echo "--------------------------------------------------"
echo "All processes started successfully."
echo "Access the UI at: http://localhost:3000"
echo "Press CTRL+C in this terminal window to stop all services."
echo "--------------------------------------------------"

# Clean termination logic
cleanup() {
    echo -e "\n[STATUS] Terminating all background processes..."
    kill $QDRANT_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null
    wait $QDRANT_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo "[STATUS] Port configurations cleared. Shutdown complete."
}

trap cleanup SIGINT SIGTERM EXIT

# Keep the script alive waiting for child processes
wait
