// Export-parity guard for the generated `./wasm` subpath.
//
// `src/wasm/src/lib.rs` is the source of truth for the wasm API. The
// wasm-pack output in `src/node/wasm/` is generated (and gitignored), so a
// stale build can silently miss a newly added `#[wasm_bindgen]` export.
// This check fails when any top-level wasm export from `lib.rs` is missing
// from the generated JS glue or its TypeScript declarations, when the
// generated glue or declarations still export names that `lib.rs` dropped,
// when the hand-written `wasm-node.js` facade disagrees with that set, or
// when the package's `./wasm` entry does not point at that output. `initSync`
// and the default export are wasm-bindgen initialization glue and are allowed
// on top of the API set.
//
// Run: `node check-wasm-exports.js` (from `src/node/`). Exit non-zero
// lists the missing names.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

const glueNames = new Set(['initSync', 'default', '__wbg_init'])

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
  return new Set([...names].filter((name) => !glueNames.has(name)))
}

const runtimeNames = declaredNames(readFileSync(join(dir, wasmExport.default), 'utf8'))
const typeNames = declaredNames(readFileSync(typesEntry, 'utf8'))

const jsNameOf = (attrs, rustName) => {
  const match = attrs.match(/js_name\s*=\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))/)
  return match ? match[1] || match[2] : rustName
}

const libSrc = readFileSync(join(dir, '../wasm/src/lib.rs'), 'utf8')

const countBraces = (line) => (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0)

const stripLiterals = (line) =>
  line
    .replace(/\/\/.*$/, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")

const wanted = []
let depth = 0
let pendingAttrs = null
for (const rawLine of libSrc.split('\n')) {
  const line = stripLiterals(rawLine)
  if (depth === 0) {
    const attribute = line.trim().match(/^#\[wasm_bindgen(?:\((.*)\))?\]$/)
    if (attribute) {
      pendingAttrs = attribute[1] ?? ''
    } else if (pendingAttrs !== null) {
      const item = line.trim().match(/^(?:pub\s+)?(fn|struct)\s+([A-Za-z_][A-Za-z0-9_]*)/)
      if (item) {
        // Getters/setters are members of an exported class, not top-level.
        if (!/\b(getter|setter)\b/.test(pendingAttrs)) {
          wanted.push(jsNameOf(pendingAttrs, item[2]))
        }
        pendingAttrs = null
      } else if (/^(?:pub\s+)?(impl|enum|type|const|static|use|mod)\b/.test(line.trim())) {
        pendingAttrs = null
      }
    }
  }
  depth += countBraces(line)
}

if (wanted.length === 0) {
  console.error('check-wasm-exports: no `#[wasm_bindgen]` exports found in src/wasm/src/lib.rs')
  process.exit(2)
}

const missingRuntime = wanted.filter((name) => !runtimeNames.has(name))
const missingTypes = wanted.filter((name) => !typeNames.has(name))
const extraRuntime = [...runtimeNames].filter((name) => !wanted.includes(name))
const extraTypes = [...typeNames].filter((name) => !wanted.includes(name))

const wasmNodeSource = readFileSync(join(dir, 'wasm-node.js'), 'utf8')
const adapterNames = new Set()
for (const match of wasmNodeSource.matchAll(/export\s+const\s*\{([^}]+)\}\s*=\s*wasm/g)) {
  for (const name of match[1].split(',')) {
    const trimmed = name.trim()
    if (trimmed) adapterNames.add(trimmed)
  }
}
if (adapterNames.size === 0) {
  console.error('check-wasm-exports: wasm-node.js has no `export const { ... } = wasm` list')
  process.exit(1)
}
const adapterApiNames = [...adapterNames].filter((name) => !glueNames.has(name))
const missingFromAdapter = wanted.filter((name) => !adapterApiNames.includes(name))
const extraInAdapter = adapterApiNames.filter((name) => !wanted.includes(name))
const hasDefaultInit = /export\s+default\s+wasm\.default/.test(wasmNodeSource)

if (missingRuntime.length > 0) {
  console.error(`check-wasm-exports: wasm JS glue is missing exports: ${missingRuntime.join(', ')}`)
}
if (missingTypes.length > 0) {
  console.error(`check-wasm-exports: wasm types are missing exports: ${missingTypes.join(', ')}`)
}
if (extraRuntime.length > 0) {
  console.error(`check-wasm-exports: wasm JS glue exports unknown names: ${extraRuntime.join(', ')}`)
}
if (extraTypes.length > 0) {
  console.error(`check-wasm-exports: wasm types export unknown names: ${extraTypes.join(', ')}`)
}
if (missingFromAdapter.length > 0) {
  console.error(`check-wasm-exports: wasm-node.js is missing exports: ${missingFromAdapter.join(', ')}`)
}
if (extraInAdapter.length > 0) {
  console.error(`check-wasm-exports: wasm-node.js exports unknown names: ${extraInAdapter.join(', ')}`)
}
if (!hasDefaultInit) {
  console.error('check-wasm-exports: wasm-node.js must re-export the default init function only')
}
if (
  missingRuntime.length > 0 ||
  missingTypes.length > 0 ||
  extraRuntime.length > 0 ||
  extraTypes.length > 0 ||
  missingFromAdapter.length > 0 ||
  extraInAdapter.length > 0 ||
  !hasDefaultInit
) {
  console.error('check-wasm-exports: rebuild with `npm run build:wasm` or fix wasm-node.js')
  process.exit(1)
}

console.log(`check-wasm-exports: OK (${wanted.length} exports)`)
