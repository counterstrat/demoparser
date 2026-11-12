# Building instructions

```npm run build```

This builds both the native napi binding and the generated WASM output in
`wasm/` (via `wasm-pack`, `web` target). To build only the WASM output:

```npm run build:wasm```

After that you should be able to import like this (ESM-only, node >= 22):

```JavaScript
import { parseEvent, parseTicks } from './index.js';
```

Or use the WASM build (takes demo bytes). Node initializes it automatically:

```JavaScript
import { parseEvent, parseTicks } from './wasm-node.js';
```

Browsers and bundlers import the `web` entrypoint and initialize it explicitly:

```JavaScript
import init, { parseEvent, parseTicks } from './wasm/demoparser.js';

await init();
```

`npm run build` finishes by running both export-parity guards
(`node check-exports.js` and `node check-wasm-exports.js`).

## Packaging

The platform `.node` binaries are not part of the root tarball. `npm publish`
runs `prepublishOnly`, which verifies both entries and then calls
`napi prepublish` to copy binaries into the generated per-triple packages and
add them as `optionalDependencies`. Run `npm run build` (or `napi artifacts`
in CI) first so the local binding and `wasm/` output exist. `npm pack` without
that prepublish path produces a tarball with no binaries and no
`optionalDependencies`, so use it only to inspect file contents.
