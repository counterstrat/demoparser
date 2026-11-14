# @counterstrat/demoparser

One ESM-only package (Node >= 22): native napi binding by default, WASM for
browsers and edge runtimes.

## Install

```sh
npm install @counterstrat/demoparser
```

Native (Node/Bun):

```JavaScript
import { parseEvent, parseTicks } from '@counterstrat/demoparser';
```

WASM (takes demo bytes, no Node builtins):

```JavaScript
import { parseEvent, parseTicks } from '@counterstrat/demoparser/wasm';
```

`./wasm` resolves by export condition. `node` picks the auto-initialized
wrapper (`wasm-node.js`); `default` picks the wasm-bindgen `web` build, where
the default export is the async initializer only and the named exports are the
API:

```JavaScript
import init, { parseEvent, parseTicks } from '@counterstrat/demoparser/wasm';

await init();
```

The WASM binding does not expose `propStates` (core supports it; the binding is
not threaded through).

## Prop states (native only)

`parseTicks` accepts `{ prop, state }` objects. `state` may be a boolean,
string, finite number, or BigInt; integers above `u32::MAX` (4294967295) must
be BigInt. A tick is kept only when every player matches every wanted state.

## Building from source

### Prerequisites

```sh
rustup toolchain install stable
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
cd src/node && npm ci
```

Node >= 22, Rust stable, `wasm-pack`, and the `wasm32-unknown-unknown` target.

### Build

```sh
npm run build        # native + WASM + both parity guards
npm run build:wasm   # WASM only
```

### Test

```sh
npm test              # node --test prop-states suite, then jest
npm run check:exports # native entry/type/binary parity
npm run check:wasm    # WASM glue/type/adapter parity
npm run pack:local    # tarballs into dist/, then smoke-install both
```

`npm test` and `pack:local` need a built native binding (`npm run build`).
Jest also needs `tests/data/` (unzip `tests/zipped_testdata.zip`) and
`../python/tests/test.dem`, a gitignored demo that a fresh clone must provision.

## Packaging

`npm pack` and `npm publish` run `prepack` (native + WASM + guards), so `wasm/`
ships in the root tarball. Platform `.node` binaries do not; `npm publish` runs
`prepublishOnly` (`create:npm-dirs && napi prepublish`) to publish per-triple
packages and add their `optionalDependencies`. npm runs `prepublishOnly` before
`prepack`, so build first (`npm run build` or `napi artifacts`).

`npm run pack:local` writes the root and matching platform tarballs to
`src/node/dist/` and prints a ready `npm install <root.tgz> <platform.tgz>`
line.
