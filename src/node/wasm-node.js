import { existsSync, readFileSync } from 'node:fs'

const entry = new URL('./wasm/demoparser.js', import.meta.url)
const binary = new URL('./wasm/demoparser_bg.wasm', import.meta.url)

if (!existsSync(entry) || !existsSync(binary)) {
  throw new Error(
    '@counterstrat/demoparser/wasm is not built. Run `npm run build:wasm` from src/node ' +
      '(requires wasm-pack and the wasm32-unknown-unknown Rust target).'
  )
}

const wasm = await import(entry.href)
wasm.initSync({ module: readFileSync(binary) })

export default wasm.default
export const {
  ChunkParser,
  initSync,
  listGameEvents,
  listUpdatedFields,
  parseEvent,
  parseEvents,
  parseGrenades,
  parseHeader,
  parseTickRange,
  parseTicks
} = wasm
