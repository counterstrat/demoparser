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
// The prop-state surface is also guarded: `parseTicks` and `parseTickRange`
// must keep their `prop_states` parameter in both `lib.rs` and the generated
// declarations, `ChunkOpts` must keep its serde-mapped `propStates` field,
// the `ChunkParser` constructor must read it through `Reflect`, and the
// generated `ChunkOpts` TypeScript interface must expose it. `parseTicks` and
// `parseTickRange` must also keep `order_by_steamid` between
// `struct_of_arrays` and `prop_states` in both signatures and thread it into
// `ParserInputs`, so the WASM argument order cannot drift from native.
// Signatures and struct/function bodies are parsed structurally (balanced
// parens/braces, comments and strings masked), so docs and substrings cannot
// satisfy the guard.
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
const typesSource = readFileSync(typesEntry, 'utf8')
const typeNames = declaredNames(typesSource)

const jsNameOf = (attrs, rustName) => {
  const match = attrs.match(/js_name\s*=\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))/)
  return match ? match[1] || match[2] : rustName
}

const libSrc = readFileSync(join(dir, '../wasm/src/lib.rs'), 'utf8')

// Blank comments and string/char literals while keeping byte positions, so
// structural scans (balanced braces/parens, signatures) never trip over
// braces in doc comments or error strings. Raw strings matter here because
// `typescript_custom_section` embeds TypeScript with braces.
const maskTrivia = (source, rust) => {
  const out = source.split('')
  const blank = (start, end) => {
    for (let i = start; i < end && i < out.length; i += 1) {
      if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' '
    }
  }
  let i = 0
  while (i < source.length) {
    if (source.startsWith('//', i)) {
      const newline = source.indexOf('\n', i)
      const stop = newline === -1 ? source.length : newline
      blank(i, stop)
      i = stop
    } else if (source.startsWith('/*', i)) {
      let depth = 1
      let j = i + 2
      while (j < source.length && depth > 0) {
        if (source.startsWith('/*', j)) {
          depth += 1
          j += 2
        } else if (source.startsWith('*/', j)) {
          depth -= 1
          j += 2
        } else {
          j += 1
        }
      }
      blank(i, j)
      i = j
    } else if (rust && source[i] === 'r' && (i === 0 || !/[A-Za-z0-9_]/.test(source[i - 1]))) {
      const prefix = /^r(#*)"/.exec(source.slice(i))
      if (!prefix) {
        i += 1
        continue
      }
      const close = `"${prefix[1]}`
      const start = i + prefix[0].length
      const found = source.indexOf(close, start)
      const stop = found === -1 ? source.length : found + close.length
      blank(i, stop)
      i = stop
    } else if (source[i] === '"') {
      let j = i + 1
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === '"') {
          j += 1
          break
        }
        j += 1
      }
      blank(i, j)
      i = j
    } else if (!rust && source[i] === "'") {
      let j = i + 1
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === "'") {
          j += 1
          break
        }
        j += 1
      }
      blank(i, j)
      i = j
    } else if (rust && source[i] === "'") {
      const charLiteral = /^'(?:\\.|[^\\'])'/.exec(source.slice(i, i + 8))
      if (charLiteral) {
        blank(i, i + charLiteral[0].length)
        i += charLiteral[0].length
      } else {
        i += 1
      }
    } else {
      i += 1
    }
  }
  return out.join('')
}

const maskedLib = maskTrivia(libSrc, true)
const maskedTypes = maskTrivia(typesSource, false)

const endOfBalanced = (source, openIndex) => {
  const close = { '(': ')', '{': '}', '[': ']' }[source[openIndex]]
  if (!close) return -1
  let depth = 0
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === source[openIndex]) depth += 1
    else if (source[i] === close) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

const bodyAfter = (source, pattern) => {
  const match = pattern.exec(source)
  if (!match) return null
  const openIndex = match.index + match[0].length - 1
  const end = endOfBalanced(source, openIndex)
  return end === -1 ? null : { start: openIndex + 1, end }
}

const paramsOf = (source, pattern) => {
  const match = pattern.exec(source)
  if (!match) return null
  const openIndex = match.index + match[0].length - 1
  const end = endOfBalanced(source, openIndex)
  return end === -1 ? null : source.slice(openIndex + 1, end)
}

const countBraces = (line) => (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0)

const stripLiterals = (line) =>
  line
    .replace(/\/\/.*$/, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")

const wanted = []
let depth = 0
let pendingAttrs = null
for (const rawLine of maskedLib.split('\n')) {
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

const rustParameters = (name) => paramsOf(maskedLib, new RegExp(`\\bfn\\s+${name}\\s*\\(`))
const tsParameters = (name) =>
  paramsOf(maskedTypes, new RegExp(`\\bexport\\s+function\\s+${name}\\s*\\(`))

const propStateFunctions = ['parseTicks', 'parseTickRange']
const missingPropStateParams = propStateFunctions.filter((name) => {
  const rust = rustParameters(name)
  const ts = tsParameters(name)
  return rust === null || !/\bprop_states\s*:/.test(rust) || ts === null || !/\bprop_states\b/.test(ts)
})

const functionBodyOf = (name) => {
  const match = new RegExp(`\\bfn\\s+${name}\\s*\\(`).exec(maskedLib)
  if (!match) return null
  const paramsOpen = match.index + match[0].length - 1
  const paramsEnd = endOfBalanced(maskedLib, paramsOpen)
  if (paramsEnd === -1) return null
  const bodyStart = maskedLib.indexOf('{', paramsEnd)
  if (bodyStart === -1) return null
  const bodyEnd = endOfBalanced(maskedLib, bodyStart)
  return bodyEnd === -1 ? null : libSrc.slice(bodyStart, bodyEnd)
}

const paramsInOrder = (params, names) => {
  if (params === null) return false
  let cursor = 0
  for (const name of names) {
    const match = new RegExp(`\\b${name}\\s*\\??\\s*:`).exec(params.slice(cursor))
    if (!match) return false
    cursor += match.index + match[0].length
  }
  return true
}

const orderParams = ['struct_of_arrays', 'order_by_steamid', 'prop_states']
const orderFunctions = ['parseTicks', 'parseTickRange']
const orderOk = orderFunctions.every((name) => {
  const body = functionBodyOf(name) ?? ''
  return (
    paramsInOrder(rustParameters(name), orderParams) &&
    paramsInOrder(tsParameters(name), orderParams) &&
    /let\s+order_by_steamid\s*=\s*match\s+order_by_steamid\b/.test(body) &&
    /\border_by_steamid\s*:\s*order_by_steamid\b/.test(body)
  )
})

const chunkOptsRange = bodyAfter(maskedLib, /\bstruct\s+ChunkOpts\s*\{/)
const chunkOptsSource = chunkOptsRange
  ? libSrc.slice(chunkOptsRange.start, chunkOptsRange.end)
  : ''
const chunkOptsHasPropStates =
  /#\[serde\([\s\S]*?rename\s*=\s*"propStates"[\s\S]*?\)\]\s*prop_states\s*:/.test(chunkOptsSource)

const chunkImplRange = bodyAfter(maskedLib, /\bimpl\s+ChunkParser\s*\{/)
const chunkImplMasked = chunkImplRange
  ? maskedLib.slice(chunkImplRange.start, chunkImplRange.end)
  : ''
const chunkImplSource = chunkImplRange ? libSrc.slice(chunkImplRange.start, chunkImplRange.end) : ''
const newMatch = /\bfn\s+new\s*\(/.exec(chunkImplMasked)
let chunkConstructorReadsPropStates = false
if (newMatch) {
  const paramsOpen = newMatch.index + newMatch[0].length - 1
  const paramsEnd = endOfBalanced(chunkImplMasked, paramsOpen)
  const bodyStart = paramsEnd === -1 ? -1 : chunkImplMasked.indexOf('{', paramsEnd)
  const bodyEnd = bodyStart === -1 ? -1 : endOfBalanced(chunkImplMasked, bodyStart)
  const body =
    bodyStart === -1 || bodyEnd === -1 ? '' : chunkImplSource.slice(bodyStart, bodyEnd)
  chunkConstructorReadsPropStates = /Reflect::get\s*\([^;]*?JsValue::from_str\s*\(\s*"propStates"\s*\)/.test(
    body
  )
}

const chunkOptsTypeRange = bodyAfter(maskedTypes, /\binterface\s+ChunkOpts\s*\{/)
const chunkOptsTypeSource = chunkOptsTypeRange
  ? typesSource.slice(chunkOptsTypeRange.start, chunkOptsTypeRange.end)
  : ''
const chunkOptsTypeHasPropStates = /\bpropStates\s*\??\s*:/.test(chunkOptsTypeSource)

const missingChunkPropStates =
  !chunkOptsHasPropStates || !chunkConstructorReadsPropStates || !chunkOptsTypeHasPropStates

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
if (missingPropStateParams.length > 0) {
  console.error(
    `check-wasm-exports: propStates is not exposed on: ${missingPropStateParams.join(', ')}`
  )
}
if (!orderOk) {
  console.error(
    'check-wasm-exports: parseTicks and parseTickRange must keep struct_of_arrays, order_by_steamid, prop_states in that order in lib.rs and the generated declarations, and thread order_by_steamid into ParserInputs'
  )
}
if (missingChunkPropStates) {
  const gaps = []
  if (!chunkOptsHasPropStates) gaps.push('ChunkOpts.propStates field')
  if (!chunkConstructorReadsPropStates) gaps.push('constructor Reflect read')
  if (!chunkOptsTypeHasPropStates) gaps.push('ChunkOpts TypeScript interface')
  console.error(`check-wasm-exports: ChunkParser opts is missing propStates support: ${gaps.join(', ')}`)
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
  missingPropStateParams.length > 0 ||
  !orderOk ||
  missingChunkPropStates ||
  !hasDefaultInit
) {
  console.error('check-wasm-exports: rebuild with `npm run build:wasm` or fix wasm-node.js')
  process.exit(1)
}

console.log(`check-wasm-exports: OK (${wanted.length} exports)`)
