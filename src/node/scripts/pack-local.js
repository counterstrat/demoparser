// Pack the root package and the local platform package into `dist/`, then
// install both into a throwaway project and smoke-import the native and WASM
// entries to prove the emitted tarballs work.
//
// Run: `npm run pack:local` from `src/node/` (needs a built tree).

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const demoPath = resolve(packageDir, '..', 'parser', 'test_demo.dem')

const npmDir = join(packageDir, 'npm')

const platformArchABI = () => {
  const arch = process.arch
  if (process.platform === 'linux') {
    const glibc = process.report?.getReport?.().header?.glibcVersionRuntime
    return `linux-${arch}-${glibc ? 'gnu' : 'musl'}`
  }
  if (process.platform === 'darwin') return `darwin-${arch}`
  if (process.platform === 'win32') return `win32-${arch}-msvc`
  return `${process.platform}-${arch}`
}

const selectTriple = () => {
  const abi = platformArchABI()
  if (existsSync(join(npmDir, abi, 'package.json'))) return abi
  const prefix = `${process.platform === 'win32' ? 'win32' : process.platform}-${process.arch}`
  const matches = existsSync(npmDir)
    ? readdirSync(npmDir).filter((name) => name.startsWith(prefix) && existsSync(join(npmDir, name, 'package.json')))
    : []
  return matches.length === 1 ? matches[0] : null
}

const triple = selectTriple()
if (!triple) {
  throw new Error(
    `No npm/<triple> platform package for ${platformArchABI()}. Run \`npm run create:npm-dirs\` from ${packageDir}.`
  )
}

const binaryName = `demoparser.${triple}.node`
const localBinary = join(packageDir, binaryName)
const platformBinary = join(npmDir, triple, binaryName)
if (!existsSync(localBinary) && !existsSync(platformBinary)) {
  throw new Error(
    `Native binding is not built (missing ${binaryName}). Run \`npm run build\` from ${packageDir} first.`
  )
}

const wasmFiles = ['wasm/demoparser.js', 'wasm/demoparser_bg.wasm', 'wasm/demoparser.d.ts']
const missingWasm = wasmFiles.filter((file) => !existsSync(join(packageDir, file)))
if (missingWasm.length > 0) {
  throw new Error(
    `WASM build is missing ${missingWasm.join(', ')}. Run \`npm run build:wasm\` from ${packageDir} first.`
  )
}

if (!existsSync(join(npmDir, triple, 'package.json'))) {
  throw new Error(`Platform package is missing ${join(npmDir, triple, 'package.json')}`)
}
if (existsSync(localBinary)) copyFileSync(localBinary, platformBinary)

const distDir = join(packageDir, 'dist')
rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

const appDir = mkdtempSync(join(tmpdir(), 'demoparser-install-'))

const pack = (cwd) => {
  const output = execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', distDir],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  )
  return join(distDir, JSON.parse(output)[0].filename)
}

try {
  const rootTarball = pack(packageDir)
  const platformTarball = pack(join(npmDir, triple))

  console.log(`Root tarball:     ${rootTarball}`)
  console.log(`Platform tarball: ${platformTarball}`)
  console.log(`\nInstall with:\n  npm install ${rootTarball} ${platformTarball}\n`)

  writeFileSync(
    join(appDir, 'package.json'),
    `${JSON.stringify({ name: 'demoparser-install-smoke', private: true, type: 'module' }, null, 2)}\n`
  )
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
      '--silent',
      rootTarball,
      platformTarball,
    ],
    { cwd: appDir, stdio: ['ignore', 'inherit', 'inherit'] }
  )

  writeFileSync(
    join(appDir, 'smoke.mjs'),
    `import { readFileSync } from 'node:fs'
import { listGameEvents as nativeListGameEvents } from '@counterstrat/demoparser'
import { listGameEvents as wasmListGameEvents } from '@counterstrat/demoparser/wasm'

const demo = ${JSON.stringify(demoPath)}
const nativeEvents = nativeListGameEvents(demo).length
const wasmEvents = wasmListGameEvents(readFileSync(demo)).length
if (nativeEvents === 0) throw new Error('native listGameEvents returned no events')
if (wasmEvents !== nativeEvents) {
  throw new Error(\`native/wasm listGameEvents disagree: \${nativeEvents} != \${wasmEvents}\`)
}
console.log(\`pack:local smoke OK: native=\${nativeEvents} events, wasm=\${wasmEvents} events\`)
`
  )
  execFileSync(process.execPath, [join(appDir, 'smoke.mjs')], { cwd: appDir, stdio: 'inherit' })
  console.log('pack:local: verified the packed pair installs and both entries load.')
} finally {
  rmSync(appDir, { recursive: true, force: true })
}
