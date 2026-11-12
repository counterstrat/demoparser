import { readFileSync } from 'node:fs'
import { initSync } from './wasm/demoparser.js'

export { default } from './wasm/demoparser.js'
export * from './wasm/demoparser.js'

initSync({ module: readFileSync(new URL('./wasm/demoparser_bg.wasm', import.meta.url)) })
