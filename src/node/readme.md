# @counterstrat/demoparser

One ESM-only package for Node/Bun (native napi binding) and for browsers, edge
runtimes, or anywhere Node's native addons do not load (WASM). Node >= 22.

## Install and import

```sh
npm install @counterstrat/demoparser
```

Node and Bun resolve the package root to the native binding:

```JavaScript
import { parseEvent, parseTicks } from '@counterstrat/demoparser';
```

The `./wasm` subpath takes demo bytes instead of a file path and has no Node
builtins. Node resolves its `node` condition to the automatically initialized
wrapper, so the import looks the same:

```JavaScript
import { parseEvent, parseTicks } from '@counterstrat/demoparser/wasm';
```

Browsers, bundlers, and edge runtimes resolve the `default` condition to the
wasm-bindgen `web` build. Its default export is the async initializer; the API
is the named exports. Bundlers that understand `new URL(..., import.meta.url)`
(Vite, webpack 5, Rollup) pick up the `.wasm` asset automatically:

```JavaScript
import init, { parseEvent, parseTicks } from '@counterstrat/demoparser/wasm';

await init();
```

The WASM build does **not** support `propStates`. That filter is native-only.

## Prop states (native only)

`parseTicks` prop states are plain objects (`{ prop, state }`). `state` accepts
booleans, strings, finite numbers, and BigInts. Integer values above
`u32::MAX` (4294967295) must be passed as BigInt; plain numbers there are
rejected. A tick is kept only when every player matches every wanted state.

## Building from source

### Prerequisites

```sh
rustup toolchain install stable
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
cd src/node && npm ci
```

Node >= 22 (the `engines` floor), Rust stable, `wasm-pack`, and the
`wasm32-unknown-unknown` target. `@napi-rs/cli` comes from `npm ci`.

### Build

```sh
npm run build
```

This builds both the native binding and the WASM output in `wasm/` (via
`wasm-pack`, `web` target), then runs both export-parity guards
(`node check-exports.js` and `node check-wasm-exports.js`). To build only the
WASM output:

```sh
npm run build:wasm
```

### Testing

```sh
npm test                # node --test prop-states suite, then jest
npm run check:exports   # native entry, types, and local binary parity
npm run check:wasm      # wasm glue, types, and adapter parity
```

`npm test` needs a built native binding (`npm run build`). The parity guards
also run at the end of `npm run build`.

## Packaging

`npm pack` and `npm publish` run `prepack`, which rebuilds the native binding
and the WASM output and runs both guards, so `wasm/` ships inside the root
tarball.

The platform `.node` binaries are not part of the root tarball. `npm publish`
also runs `prepublishOnly` (`npm run create:npm-dirs && napi prepublish`) to
publish the generated per-triple packages and add them as
`optionalDependencies`. npm runs `prepublishOnly` before `prepack`, so that
step expects build artifacts to already exist: run `npm run build` (or
`napi artifacts` in CI) before `npm publish`. A tarball produced with lifecycle
scripts disabled has no native binaries or `optionalDependencies`; `wasm/` is
present only if it was built separately.
