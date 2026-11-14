import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliDecompressSync } from 'node:zlib'

const testsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tests')
const blob = join(testsDir, 'testdata.json.br')
const dataDir = join(testsDir, 'data')
const marker = join(dataDir, '.extracted')
const header = join(dataDir, 'header.json')

const isFresh = () =>
  existsSync(marker) &&
  existsSync(header) &&
  statSync(marker).mtimeMs >= statSync(blob).mtimeMs

if (isFresh()) process.exit(0)

const fixtures = JSON.parse(brotliDecompressSync(readFileSync(blob)))
rmSync(dataDir, { recursive: true, force: true })
mkdirSync(dataDir, { recursive: true })
for (const [relativePath, contents] of Object.entries(fixtures)) {
  const file = join(dataDir, relativePath)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, contents)
}
writeFileSync(marker, '')
