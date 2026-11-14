#!/usr/bin/env bash
set -euo pipefail

wasm-pack build --target web --out-dir ../node/wasm --out-name demoparser
rm -f ../node/wasm/.gitignore
