import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as native from '../index.js'

let wasm = null
try {
  wasm = await import('../wasm-node.js')
} catch (error) {
  console.warn(`wasm prop-state parity tests skipped: ${error.message}`)
}

const wasmTest = wasm
  ? test
  : (name, fn) => test(name, { skip: 'wasm build output is not built' }, fn)

const demoPath = fileURLToPath(new URL('../../parser/test_demo.dem', import.meta.url))
const bytes = new Uint8Array(readFileSync(demoPath))
const ticks = [50, 100, 200, 300, 400, 500]

const plain = (value) => {
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([key, inner]) => [key, plain(inner)]))
  }
  if (Array.isArray(value)) return value.map(plain)
  return value
}

const nativeTicks = (props, wantedTicks, propStates) =>
  native.parseTicks(demoPath, props, wantedTicks, null, false, false, propStates)

const wasmTicks = (props, wantedTicks, propStates) =>
  wasm.parseTicks(bytes, props, wantedTicks, null, false, propStates)

const wasmRange = (props, lo, hi, propStates) =>
  wasm.parseTickRange(bytes, props, lo, hi, null, false, propStates)

const matchingCases = [
  ['health numeric', ['health'], ticks, [{ prop: 'health', state: 100 }]],
  ['health no match', ['health'], ticks, [{ prop: 'health', state: 0 }]],
  ['float 71 as number', ['game_time'], [80], [{ prop: 'game_time', state: 71 }]],
  ['float 71 as bigint', ['game_time'], [80], [{ prop: 'game_time', state: 71n }]],
  ['bool true match', ['is_bomb_planted'], [8500], [{ prop: 'is_bomb_planted', state: true }]],
  ['bool true no match', ['is_bomb_planted'], [100], [{ prop: 'is_bomb_planted', state: true }]],
  ['string team name', ['team_name'], ticks, [{ prop: 'team_name', state: 'CT' }]],
  ['bigint above u32', ['game_time'], [80], [{ prop: 'game_time', state: 4294967296n }]],
  ['bigint u64 max', ['game_time'], [80], [{ prop: 'game_time', state: 18446744073709551615n }]],
  ['u32 max number', ['health'], ticks, [{ prop: 'health', state: 4294967295 }]]
]

wasmTest('parseTicks propStates matches native', async (t) => {
  for (const [name, props, wantedTicks, propStates] of matchingCases) {
    await t.test(name, () => {
      const expected = nativeTicks(props, wantedTicks, propStates)
      const actual = plain(wasmTicks(props, wantedTicks, propStates))
      assert.deepEqual(actual, expected)
    })
  }
})

const rejectionCases = [
  [
    'duplicate prop',
    [
      { prop: 'team_name', state: 'CT' },
      { prop: 'team_name', state: 'TERRORIST' }
    ],
    /Duplicate prop state/
  ],
  [
    'alias collision',
    [
      { prop: 'team_name', state: 'CT' },
      { prop: 'CCSTeam.m_szTeamname', state: 'TERRORIST' }
    ],
    /same real name/
  ],
  ['missing state', [{ prop: 'team_name' }], /state/],
  ['missing prop', [{ state: 'CT' }], /prop/],
  ['NaN', [{ prop: 'team_name', state: NaN }], /finite/],
  ['Infinity', [{ prop: 'team_name', state: Infinity }], /finite/],
  ['number above u32', [{ prop: 'team_name', state: 4294967296 }], /BigInt/],
  ['negative bigint', [{ prop: 'team_name', state: -1n }], /Unsupported number type/],
  ['bigint above u64', [{ prop: 'team_name', state: 18446744073709551616n }], /Unsupported number type/],
  [
    'unsupported state object',
    [{ prop: 'team_name', state: {} }],
    /boolean, string, number, or bigint|Unsupported type/
  ]
]

wasmTest('propStates rejections match native', async (t) => {
  for (const [name, propStates, pattern] of rejectionCases) {
    await t.test(name, () => {
      assert.throws(() => nativeTicks(['team_name'], ticks, propStates), pattern)
      assert.throws(() => wasmTicks(['team_name'], ticks, propStates), pattern)
    })
  }
})

wasmTest('parseTickRange propStates matches native parseTicks', async (t) => {
  for (const [lo, hi] of [
    [80, 80],
    [100, 300]
  ]) {
    const wantedTicks = []
    for (let tick = lo; tick <= hi; tick += 1) wantedTicks.push(tick)

    for (const [prop, state] of [
      ['health', 100],
      ['game_time', 71n],
      ['team_name', 'CT']
    ]) {
      await t.test(`${lo}-${hi} ${prop}`, () => {
        const expected = nativeTicks([prop], wantedTicks, [{ prop, state }])
        const actual = plain(wasmRange([prop], lo, hi, [{ prop, state }]))
        assert.deepEqual(actual, expected)
      })
    }
  }
})

wasmTest('ChunkParser ticks mode propStates matches native', () => {
  const rows = []
  const parser = new wasm.ChunkParser(bytes, 'ticks', ticks, {
    wantedProps: ['health'],
    propStates: [{ prop: 'health', state: 100 }]
  })

  let chunk
  while ((chunk = parser.nextChunk()) !== undefined) rows.push(...chunk)

  const expected = nativeTicks(['health'], ticks, [{ prop: 'health', state: 100 }])
  assert.deepEqual(plain(rows), expected)
})
