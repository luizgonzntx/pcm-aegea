#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/dist"

rm -rf -- "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/assets"

cp \
  "$ROOT_DIR/teresina/index.html" \
  "$ROOT_DIR/teresina/admin.html" \
  "$ROOT_DIR/teresina/app.js" \
  "$ROOT_DIR/teresina/pcm-neural-orb.js" \
  "$ROOT_DIR/teresina/pcm-neural-orb.css" \
  "$ROOT_DIR/teresina/core.js" \
  "$ROOT_DIR/teresina/inventory.js" \
  "$ROOT_DIR/teresina/ui.js" \
  "$ROOT_DIR/teresina/style.css" \
  "$ROOT_DIR/teresina/config.js" \
  "$ROOT_DIR/teresina/import-worker.js" \
  "$OUTPUT_DIR/"
cp -R "$ROOT_DIR/teresina/assets/." "$OUTPUT_DIR/assets/"
