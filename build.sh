#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Building Mandelbrot Explorer ==="

# 1. Build WASM
echo "[1/3] Building WASM module..."
wasm-pack build crates/mandelbrot-wasm \
    --target web \
    --out-dir ../../frontend/wasm \
    --release \
    --no-typescript

# Remove unnecessary files from wasm-pack output
rm -f frontend/wasm/.gitignore frontend/wasm/package.json frontend/wasm/README.md

# 2. Prepare dist directory
echo "[2/3] Assembling frontend dist..."
rm -rf frontend/dist
mkdir -p frontend/dist/static frontend/dist/wasm frontend/dist/icons

cp frontend/index.html frontend/dist/
cp frontend/manifest.json frontend/dist/
cp frontend/sw.js frontend/dist/
cp frontend/static/* frontend/dist/static/
cp frontend/wasm/* frontend/dist/wasm/
cp frontend/icons/* frontend/dist/icons/

# 3. Build server
echo "[3/3] Building server..."
cargo build --release -p mandelbrot-server

echo "=== Build complete ==="
echo "Run with: ./target/release/mandelbrot-server"
echo "Or use: docker-compose up"
