import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants } from 'node:zlib'

const testsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tests')
const dataDir = join(testsDir, 'data')
const blob = join(testsDir, 'testdata.json.br')
const header = join(dataDir, 'header.json')

if (!existsSync(header)) {
  console.error('tests/data/ is missing. Run `node scripts/extract-testdata.js` from src/node first.')
  process.exit(1)
}

const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.json')) files.push(relative(dataDir, full).split(sep).join('/'))
  }
}
walk(dataDir)
files.sort()

const fixtures = {}
for (const relativePath of files) {
  fixtures[relativePath] = readFileSync(join(dataDir, relativePath), 'utf8')
}

const compressed = brotliCompressSync(Buffer.from(JSON.stringify(fixtures)), {
  params: { [constants.BROTLI_PARAM_QUALITY]: 11 }
})
writeFileSync(blob, compressed)
console.log(`Packed ${files.length} fixtures into ${blob} (${compressed.length} bytes)`)
