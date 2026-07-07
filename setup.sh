#!/bin/bash
set -e

echo "=========================================="
echo "AETHER VISION RAG - UNIX SYSTEM SETUP"
echo "=========================================="

# 1. Verify Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not found. Please install Node.js (v18+) to run the frontend."
    exit 1
fi
echo "[OK] Node.js is available: $(node -v)"

# 2. Verify Python 3.12+
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 is not found. Please install Python 3.12+."
    exit 1
fi

python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)" &> /dev/null
if [ $? -ne 0 ]; then
    echo "[ERROR] Python 3.12+ is required but not found. Your version is: $(python3 --version)"
    exit 1
fi
echo "[OK] Python 3.12+ is available."

# 3. Initialize Isolated Virtual Environment
echo
echo "[STATUS] Creating isolated virtual environment (.venv)..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi

echo "[STATUS] Activating virtual environment..."
source .venv/bin/activate

echo "[STATUS] Upgrading pip..."
python3 -m pip install --upgrade pip

echo "[STATUS] Installing Python dependencies..."
pip install -r backend/requirements.txt
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install Python dependencies."
    exit 1
fi
echo "[OK] Python dependencies installed successfully."

# 4. Download and Extract Standalone Qdrant Binary
echo
echo "[STATUS] Creating database directory..."
mkdir -p database/bin
mkdir -p database/data

OS_TYPE="$(uname -s)"
ARCH_TYPE="$(uname -m)"

echo "[STATUS] Detecting OS and architecture..."
echo "OS: $OS_TYPE, Arch: $ARCH_TYPE"

if [ "$OS_TYPE" = "Darwin" ]; then
    if [ "$ARCH_TYPE" = "arm64" ]; then
        QDRANT_URL="https://github.com/qdrant/qdrant/releases/download/v1.12.0/qdrant-aarch64-apple-darwin.tar.gz"
    else
        QDRANT_URL="https://github.com/qdrant/qdrant/releases/download/v1.12.0/qdrant-x86_64-apple-darwin.tar.gz"
    fi
else
    # Linux
    if [ "$ARCH_TYPE" = "aarch64" ] || [ "$ARCH_TYPE" = "arm64" ]; then
        QDRANT_URL="https://github.com/qdrant/qdrant/releases/download/v1.12.0/qdrant-aarch64-unknown-linux-gnu.tar.gz"
    else
        QDRANT_URL="https://github.com/qdrant/qdrant/releases/download/v1.12.0/qdrant-x86_64-unknown-linux-gnu.tar.gz"
    fi
fi

echo "[STATUS] Downloading standalone Qdrant binary from GitHub..."
curl -L "$QDRANT_URL" -o database/qdrant.tar.gz

echo "[STATUS] Extracting Qdrant binary to database/bin..."
tar -xzf database/qdrant.tar.gz -C database/bin
if [ -f "database/bin/qdrant" ]; then
    chmod +x database/bin/qdrant
fi

echo "[STATUS] Cleaning up archives..."
rm -f database/qdrant.tar.gz
echo "[OK] Qdrant binary prepared at database/bin/qdrant."

# 5. Frontend Package Setup
echo
echo "[STATUS] Installing frontend dependencies..."
cd frontend
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Frontend npm install failed."
    exit 1
fi
cd ..
echo "[OK] Frontend dependencies installed."

echo
echo "=========================================="
echo "[SUCCESS] System Setup Complete!"
echo "Run './run.sh' to launch the Vision RAG application."
echo "=========================================="
