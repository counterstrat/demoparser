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

The export-parity guards run with `node check-exports.js` and
`node check-wasm-exports.js`.
