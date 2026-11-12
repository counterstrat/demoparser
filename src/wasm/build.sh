#!/usr/bin/env bash
set -euo pipefail

wasm-pack build --target web --out-dir ../node/wasm --out-name demoparser
rm -f ../node/wasm/.gitignore

rm -rf www/pkg
cp -r ../node/wasm www/pkg
