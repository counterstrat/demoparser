import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliDecompressSync } from 'node:zlib'

const testsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tests')
const blob = join(testsDir, 'testdata.json.br')
const dataDir = join(testsDir, 'data')
const marker = join(dataDir, '.extracted')
const header = join(dataDir, 'header.json')

if (!existsSync(blob)) {
  console.error('tests/testdata.json.br is missing. Restore it from git, or run `npm run pack:testdata` from src/node after regenerating tests/data/.')
  process.exit(1)
}

const isFresh = () =>
  existsSync(marker) &&
  existsSync(header) &&
  statSync(marker).mtimeMs >= statSync(blob).mtimeMs

if (isFresh()) process.exit(0)

const fixtures = JSON.parse(brotliDecompressSync(readFileSync(blob)))
if (!fixtures || typeof fixtures !== 'object' || Array.isArray(fixtures)) {
  throw new Error('Fixture blob must contain an object mapping relative paths to JSON strings.')
}

const entries = Object.entries(fixtures)
if (entries.length === 0 || !Object.hasOwn(fixtures, 'header.json')) {
  throw new Error('Fixture blob is missing header.json or contains no fixtures.')
}

const targets = entries.map(([relativePath, contents]) => {
  if (typeof contents !== 'string') {
    throw new Error(`Fixture ${relativePath} is not a JSON string.`)
  }
  if (
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).includes('..')
  ) {
    throw new Error(`Invalid fixture path: ${relativePath}`)
  }
  const file = normalize(join(dataDir, relativePath))
  if (!file.startsWith(dataDir + sep)) {
    throw new Error(`Refusing to write outside tests/data: ${relativePath}`)
  }
  return [file, contents]
})

if (!dataDir.endsWith(`${sep}tests${sep}data`)) {
  throw new Error(`Refusing to remove unexpected data directory: ${dataDir}`)
}

rmSync(dataDir, { recursive: true, force: true })
mkdirSync(dataDir, { recursive: true })
for (const [file, contents] of targets) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, contents)
}
if (!existsSync(header)) {
  throw new Error('Extraction did not produce header.json; .extracted marker not written.')
}
writeFileSync(marker, '')
