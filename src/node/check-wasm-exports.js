// Export-parity guard for the generated `./wasm` subpath.
//
// `src/wasm/src/lib.rs` is the source of truth for the wasm API. The
// wasm-pack output in `src/node/wasm/` is generated (and gitignored), so a
// stale build can silently miss a newly added `#[wasm_bindgen]` export.
// This check fails when any top-level wasm export from `lib.rs` is missing
// from the generated JS glue or its TypeScript declarations, or when the
// package's `./wasm` entry does not point at that output.
//
// Run: `node check-wasm-exports.js` (from `src/node/`). Exit non-zero
// lists the missing names.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
const wasmExport = pkg.exports?.['./wasm']

if (!wasmExport || typeof wasmExport !== 'object') {
  console.error('check-wasm-exports: package.json has no `./wasm` export')
  process.exit(2)
}

if (typeof wasmExport.types !== 'string') {
  console.error('check-wasm-exports: `./wasm` export needs a `types` string entry')
  process.exit(2)
}

const runtimeEntries = ['default', 'node'].map((condition) => {
  const entry = wasmExport[condition]
  if (typeof entry !== 'string') {
    console.error(`check-wasm-exports: \`./wasm\` export needs a \`${condition}\` string entry`)
    process.exit(2)
  }
  return [condition, entry]
})

const typesEntry = join(dir, wasmExport.types)
for (const [label, entry] of [['types', wasmExport.types], ...runtimeEntries]) {
  if (!existsSync(join(dir, entry))) {
    console.error(`check-wasm-exports: ${label} entry missing: ${entry}`)
    process.exit(2)
  }
}

const runtimeEntry = join(dir, wasmExport.default)
const wasmDir = dirname(runtimeEntry)
const wasmFiles = readdirSync(wasmDir).filter((f) => f.endsWith('.wasm'))
if (wasmFiles.length === 0) {
  console.error('check-wasm-exports: no .wasm binary found next to the entry')
  process.exit(2)
}

const declaredNames = (source) => {
  const names = new Set()
  const declaration = /\bexport\s+(?:declare\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g
  for (const match of source.matchAll(declaration)) names.add(match[1])
  const exportList = /\bexport\s*\{([^}]*)\}/g
  for (const match of source.matchAll(exportList)) {
    for (const item of match[1].split(',')) {
      const parts = item.trim().replace(/^type\s+/, '').split(/\s+as\s+/)
      const name = parts[parts.length - 1]
      if (name) names.add(name)
    }
  }
  return names
}

const runtimeNames = new Set()
for (const file of readdirSync(wasmDir).filter((f) => f.endsWith('.js'))) {
  for (const name of declaredNames(readFileSync(join(wasmDir, file), 'utf8'))) runtimeNames.add(name)
}
const typeNames = declaredNames(readFileSync(typesEntry, 'utf8'))

const camelCase = (name) =>
  name.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase())

const libSrc = readFileSync(join(dir, '../wasm/src/lib.rs'), 'utf8')
const exportRe =
  /^#\[wasm_bindgen(?:\(([^)]*)\))?\]\s*(?:pub\s+)?(fn|struct)\s+([A-Za-z_][A-Za-z0-9_]*)/gm

const wanted = []
for (const match of libSrc.matchAll(exportRe)) {
  const attrs = match[1] || ''
  if (attrs.includes('constructor')) continue
  const jsName = attrs.match(/js_name\s*=\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1]
  wanted.push(jsName || camelCase(match[3]))
}

if (wanted.length === 0) {
  console.error('check-wasm-exports: no `#[wasm_bindgen]` exports found in src/wasm/src/lib.rs')
  process.exit(2)
}

const missingRuntime = wanted.filter((name) => !runtimeNames.has(name))
const missingTypes = wanted.filter((name) => !typeNames.has(name))

if (missingRuntime.length > 0) {
  console.error(`check-wasm-exports: wasm JS glue is missing exports: ${missingRuntime.join(', ')}`)
}
if (missingTypes.length > 0) {
  console.error(`check-wasm-exports: wasm types are missing exports: ${missingTypes.join(', ')}`)
}
if (missingRuntime.length > 0 || missingTypes.length > 0) {
  console.error('check-wasm-exports: rebuild with `npm run build:wasm`')
  process.exit(1)
}

console.log(`check-wasm-exports: OK (${wanted.length} exports)`)
