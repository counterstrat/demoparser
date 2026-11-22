import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as native from '../index.js'

// A present wasm output means the build is expected: load failures and stale
// glue below fail this file instead of skipping it. Only a checkout without
// any wasm output skips, so native-only dev loops still run `npm test`.
const wasmEntry = new URL('../wasm/demoparser.js', import.meta.url)
const wasmBinary = new URL('../wasm/demoparser_bg.wasm', import.meta.url)
const wasmTypes = new URL('../wasm/demoparser.d.ts', import.meta.url)
const wasmBuilt = existsSync(wasmEntry) && existsSync(wasmBinary)

let wasm = null
let wasmImportError = null
if (wasmBuilt) {
  try {
    wasm = await import('../wasm-node.js')
  } catch (error) {
    wasmImportError = error
  }
}

const wasmTypesSource = wasmBuilt && existsSync(wasmTypes) ? readFileSync(wasmTypes, 'utf8') : ''
const chunkOptsDeclaresPropStates =
  /\binterface\s+ChunkOpts\s*\{[\s\S]*?\bpropStates\?\s*:/.test(wasmTypesSource)
const tickRangeWantedPropsTyped =
  /export function parseTickRange\([\s\S]*?wanted_props:\s*string\[\] \| null \| undefined/.test(
    wasmTypesSource
  )
const wantedPropStateAlias =
  /\binterface\s+WantedPropState\b/.test(wasmTypesSource) &&
  /\btype\s+ChunkPropState\s*=\s*WantedPropState\b/.test(wasmTypesSource)
const wasmSupportsPropStates = Boolean(
  wasm &&
    !wasmImportError &&
    typeof wasm.parseTicks === 'function' &&
    wasm.parseTicks.length >= 7 &&
    typeof wasm.parseTickRange === 'function' &&
    wasm.parseTickRange.length >= 8 &&
    typeof wasm.ChunkParser === 'function' &&
    chunkOptsDeclaresPropStates
)

if (wasmBuilt) {
  test('wasm build exposes the prop-state surface', () => {
    assert.equal(wasmImportError, null, `wasm build failed to load: ${wasmImportError?.message}`)
    assert.ok(wasm, 'wasm build did not load')
    assert.ok(
      typeof wasm.parseTicks === 'function' && wasm.parseTicks.length >= 7,
      'parseTicks is missing propStates'
    )
    assert.ok(
      typeof wasm.parseTickRange === 'function' && wasm.parseTickRange.length >= 8,
      'parseTickRange is missing propStates'
    )
    assert.ok(typeof wasm.ChunkParser === 'function', 'ChunkParser is missing')
    assert.ok(
      chunkOptsDeclaresPropStates,
      'ChunkOpts declarations are missing propStates; run `npm run build:wasm`'
    )
    assert.ok(
      tickRangeWantedPropsTyped,
      'parseTickRange wanted_props must be a required nullable string[] (wasm-bindgen cannot mark it optional before tick_lo/tick_hi); run `npm run build:wasm`'
    )
    assert.ok(
      wantedPropStateAlias,
      'declarations must define WantedPropState and alias ChunkPropState to it; run `npm run build:wasm`'
    )
  })
}

const skipReason = wasmBuilt
  ? 'wasm build is stale or incomplete; run `npm run build:wasm`'
  : 'wasm build output is not built; run `npm run build:wasm`'
const wasmTest = wasmSupportsPropStates
  ? test
  : (name, fn) => test(name, { skip: skipReason }, fn)

const demoPath = fileURLToPath(new URL('../../parser/test_demo.dem', import.meta.url))
const bytes = new Uint8Array(readFileSync(demoPath))
const ticks = [50, 100, 200, 300, 400, 500]
const nativeTypesSource = readFileSync(new URL('../index.d.ts', import.meta.url), 'utf8')

const plain = (value) => {
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([key, inner]) => [key, plain(inner)]))
  }
  if (Array.isArray(value)) return value.map(plain)
  return value
}

const nativeTicks = (props, wantedTicks, propStates, orderBySteamid = false, structOfArrays = false) =>
  native.parseTicks(demoPath, props, wantedTicks, null, structOfArrays, orderBySteamid, propStates)

const nativeRange = (props, lo, hi, propStates, orderBySteamid = false, structOfArrays = false) =>
  native.parseTickRange(demoPath, props, lo, hi, null, structOfArrays, orderBySteamid, propStates)

const wasmTicks = (props, wantedTicks, propStates, orderBySteamid = false, structOfArrays = false) =>
  wasm.parseTicks(bytes, props, wantedTicks, null, structOfArrays, orderBySteamid, propStates)

const wasmRange = (props, lo, hi, propStates, orderBySteamid = false, structOfArrays = false) =>
  wasm.parseTickRange(bytes, props, lo, hi, null, structOfArrays, orderBySteamid, propStates)

wasmTest('WantedPropState is one shape across bindings', () => {
  assert.match(nativeTypesSource, /\bexport interface WantedPropState\b/)
  assert.match(wasmTypesSource, /\bexport interface WantedPropState\b/)
  assert.match(wasmTypesSource, /\bexport type ChunkPropState = WantedPropState\b/)
})

wasmTest('parseHeader matches native (projectile parsing disabled)', () => {
  assert.deepEqual(plain(wasm.parseHeader(bytes)), plain(native.parseHeader(demoPath)))
})

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

wasmTest('u64-backed steamid column matches native', () => {
  const expected = nativeTicks(['steamid'], [100], null)
  const actual = plain(wasmTicks(['steamid'], [100], null))
  assert.deepEqual(actual, expected)
  assert.ok(actual.every((row) => typeof row.steamid === 'string'))
})

wasmTest('parseTicks orderBySteamid matches native', async (t) => {
  const props = ['health']

  for (const orderBySteamid of [false, true]) {
    await t.test(String(orderBySteamid), () => {
      const expected = native.parseTicks(demoPath, props, ticks, null, false, orderBySteamid, null)
      const actual = plain(wasmTicks(props, ticks, null, orderBySteamid))
      assert.deepEqual(actual, expected)
    })
  }

  const unordered = plain(wasmTicks(props, ticks, null, false))
  const ordered = plain(wasmTicks(props, ticks, null, true))
  assert.ok(Array.isArray(unordered))
  assert.ok(!Array.isArray(ordered))
  assert.ok(ordered[Object.keys(ordered)[0]].tick.every((tick, index, all) => index === 0 || tick >= all[index - 1]))
})

// Native validates `WantedPropState` through napi/serde; WASM parses the same
// shape by hand, so the rejection text differs. Assert exact WASM text and a
// stable native pattern so neither side can drift silently.
const rejectionCases = [
  [
    'duplicate prop',
    [
      { prop: 'team_name', state: 'CT' },
      { prop: 'team_name', state: 'TERRORIST' }
    ],
    /Duplicate prop state/,
    'Duplicate prop state for `team_name`'
  ],
  [
    'alias collision',
    [
      { prop: 'team_name', state: 'CT' },
      { prop: 'CCSTeam.m_szTeamname', state: 'TERRORIST' }
    ],
    /same real name/,
    'Multiple prop states resolve to the same real name `CCSTeam.m_szTeamname`'
  ],
  [
    'missing state',
    [{ prop: 'team_name' }],
    /Missing field `state`/,
    'Expected a boolean, string, number, or bigint for a prop state'
  ],
  [
    'missing prop',
    [{ state: 'CT' }],
    /Missing field `prop`/,
    'propStates entries need a string `prop`'
  ],
  [
    'NaN',
    [{ prop: 'team_name', state: NaN }],
    /Prop state numbers must be finite/,
    'Prop state numbers must be finite'
  ],
  [
    'Infinity',
    [{ prop: 'team_name', state: Infinity }],
    /Prop state numbers must be finite/,
    'Prop state numbers must be finite'
  ],
  [
    'number above u32',
    [{ prop: 'team_name', state: 4294967296 }],
    /BigInt/,
    'Integer prop states above u32::MAX must be passed as BigInt'
  ],
  [
    'number below i32 minimum',
    [{ prop: 'team_name', state: -2147483649 }],
    /BigInt/,
    'Integer prop states above u32::MAX must be passed as BigInt'
  ],
  [
    'negative bigint',
    [{ prop: 'team_name', state: -1n }],
    /Unsupported number type/,
    'Unsupported number type'
  ],
  [
    'bigint above u64',
    [{ prop: 'team_name', state: 18446744073709551616n }],
    /Unsupported number type/,
    'Unsupported number type'
  ],
  [
    'unsupported state object',
    [{ prop: 'team_name', state: {} }],
    /Unsupported type for Variant/,
    'Expected a boolean, string, number, or bigint for a prop state'
  ],
  [
    'boxed number state',
    [{ prop: 'team_name', state: new Number(1) }],
    /Unsupported type for Variant/,
    'Expected a boolean, string, number, or bigint for a prop state'
  ],
  [
    'boxed string state',
    [{ prop: 'team_name', state: new String('CT') }],
    /Unsupported type for Variant/,
    'Expected a boolean, string, number, or bigint for a prop state'
  ],
  [
    'boxed boolean state',
    [{ prop: 'team_name', state: new Boolean(true) }],
    /Unsupported type for Variant/,
    'Expected a boolean, string, number, or bigint for a prop state'
  ]
]

wasmTest('propStates rejections match native', async (t) => {
  for (const [name, propStates, nativePattern, wasmMessage] of rejectionCases) {
    await t.test(name, () => {
      assert.throws(() => nativeTicks(['team_name'], ticks, propStates), nativePattern)
      assert.throws(() => wasmTicks(['team_name'], ticks, propStates), { message: wasmMessage })
    })
  }
})

const acceptedEdgeCases = [
  ['null means unfiltered', ['health'], ticks, null],
  ['undefined means unfiltered', ['health'], ticks, undefined],
  ['empty array means unfiltered', ['health'], ticks, []],
  ['fractional number is F32', ['game_time'], [80], [{ prop: 'game_time', state: 1.5 }]],
  ['i32 MIN', ['game_time'], [80], [{ prop: 'game_time', state: -2147483648 }]],
  ['i32 MAX', ['game_time'], [80], [{ prop: 'game_time', state: 2147483647 }]],
  ['u32 range starts above i32 MAX', ['game_time'], [80], [{ prop: 'game_time', state: 2147483648 }]],
  ['negative zero', ['game_time'], [80], [{ prop: 'game_time', state: -0 }]],
  ['zero bigint', ['game_time'], [80], [{ prop: 'game_time', state: 0n }]]
]

wasmTest('propStates edge states match native', async (t) => {
  for (const [name, props, wantedTicks, propStates] of acceptedEdgeCases) {
    await t.test(name, () => {
      const expected = nativeTicks(props, wantedTicks, propStates)
      const actual = plain(wasmTicks(props, wantedTicks, propStates))
      assert.deepEqual(actual, expected)
    })
  }
})

const rejectionEdgeCases = [
  [
    'non-array object',
    { prop: 'team_name', state: 'CT' },
    /Failed to get Array length/,
    'propStates must be an array of { prop, state } objects'
  ],
  [
    'non-array string',
    'team_name',
    /Failed to get Array length/,
    'propStates must be an array of { prop, state } objects'
  ],
  [
    'non-array number',
    42,
    /Failed to get Array length/,
    'propStates must be an array of { prop, state } objects'
  ],
  [
    'non-object entry',
    ['team_name'],
    /Missing field `prop`/,
    'propStates entries must be { prop, state } objects'
  ],
  [
    'number entry',
    [42],
    /Missing field `prop`/,
    'propStates entries must be { prop, state } objects'
  ],
  [
    'null entry',
    [null],
    /Cannot convert undefined or null to object/,
    'propStates entries must be { prop, state } objects'
  ],
  [
    'non-string prop',
    [{ prop: 42, state: 'CT' }],
    /Failed to convert JavaScript value/,
    'propStates entries need a string `prop`'
  ],
  [
    'boxed string prop',
    [{ prop: new String('team_name'), state: 'CT' }],
    /Failed to convert JavaScript value/,
    'propStates entries need a string `prop`'
  ],
  [
    'symbol prop',
    [{ prop: Symbol('team_name'), state: 'CT' }],
    /Failed to convert JavaScript value/,
    'propStates entries need a string `prop`'
  ],
  [
    'null state',
    [{ prop: 'team_name', state: null }],
    /Unsupported type for Variant/,
    'Expected a boolean, string, number, or bigint for a prop state'
  ],
  [
    'undefined state',
    [{ prop: 'team_name', state: undefined }],
    /Missing field `state`/,
    'Expected a boolean, string, number, or bigint for a prop state'
  ]
]

wasmTest('propStates input-shape rejections match native', async (t) => {
  for (const [name, propStates, nativePattern, wasmMessage] of rejectionEdgeCases) {
    await t.test(name, () => {
      assert.throws(() => nativeTicks(['team_name'], ticks, propStates), nativePattern)
      assert.throws(() => wasmTicks(['team_name'], ticks, propStates), { message: wasmMessage })
    })
  }
})

wasmTest('parseTickRange propStates matches native parseTickRange', async (t) => {
  for (const [lo, hi] of [
    [80, 80],
    [100, 300]
  ]) {
    for (const [prop, state] of [
      ['health', 100],
      ['game_time', 71n],
      ['team_name', 'CT']
    ]) {
      await t.test(`${lo}-${hi} ${prop}`, () => {
        const expected = nativeRange([prop], lo, hi, [{ prop, state }])
        const actual = plain(wasmRange([prop], lo, hi, [{ prop, state }]))
        assert.deepEqual(actual, expected)
      })
    }
  }
})

wasmTest('parseTickRange orderBySteamid matches native', async (t) => {
  const props = ['health']
  const lo = 100
  const hi = 300

  for (const orderBySteamid of [false, true]) {
    await t.test(String(orderBySteamid), () => {
      const expected = nativeRange(props, lo, hi, null, orderBySteamid)
      const actual = plain(wasmRange(props, lo, hi, null, orderBySteamid))
      assert.deepEqual(actual, expected)
    })
  }

  const unordered = plain(wasmRange(props, lo, hi, null, false))
  const ordered = plain(wasmRange(props, lo, hi, null, true))
  assert.ok(Array.isArray(unordered))
  assert.ok(!Array.isArray(ordered))

  const steamids = Object.keys(ordered)
  assert.ok(steamids.length > 0)
  for (const steamid of steamids) {
    const groupTicks = ordered[steamid].tick
    assert.ok(groupTicks.length > 0)
    assert.ok(groupTicks.every((tick, index, all) => index === 0 || tick >= all[index - 1]))
  }

  const expectedBySteamid = {}
  for (const row of unordered) (expectedBySteamid[row.steamid] ??= []).push(row.tick)
  assert.deepEqual(Object.keys(ordered).sort(), Object.keys(expectedBySteamid).sort())
})

wasmTest('parseTicks combines propStates with orderBySteamid', () => {
  const props = ['health']
  const propStates = [{ prop: 'health', state: 100 }]

  const expected = nativeTicks(props, ticks, propStates, true)
  const actual = plain(wasmTicks(props, ticks, propStates, true))
  assert.deepEqual(actual, expected)
})

wasmTest('parseTickRange combines propStates with orderBySteamid', () => {
  const props = ['health']
  const lo = 100
  const hi = 300
  const propStates = [{ prop: 'health', state: 100 }]

  const expected = nativeRange(props, lo, hi, propStates, true)
  const actual = plain(wasmRange(props, lo, hi, propStates, true))
  assert.deepEqual(actual, expected)
})

// Native serializes the per-player map with u64 keys while WASM uses String
// keys; JSON object keys are strings on both sides, so the shapes compare equal.
wasmTest('parseTicks combines propStates, structOfArrays, and orderBySteamid', () => {
  const props = ['health', 'active_weapon_skin']
  const propStates = [{ prop: 'health', state: 100 }]

  const expected = nativeTicks(props, ticks, propStates, true, true)
  const actual = plain(wasmTicks(props, ticks, propStates, true, true))
  assert.deepEqual(actual, expected)
})

wasmTest('parseTickRange combines propStates, structOfArrays, and orderBySteamid', () => {
  const props = ['health', 'active_weapon_skin']
  const lo = 100
  const hi = 300
  const propStates = [{ prop: 'health', state: 100 }]

  const expected = nativeRange(props, lo, hi, propStates, true, true)
  const actual = plain(wasmRange(props, lo, hi, propStates, true, true))
  assert.deepEqual(actual, expected)
})

// active_weapon_skin has no values on the sampled ticks, so it exercises the
// absent-column path that emits a null column (SOA) or null per row (AOS).
// Ordering branches serialize through a different serializer, so test both.
wasmTest('parseTicks structOfArrays and ordered serialization match native', async (t) => {
  const props = ['health', 'active_weapon_skin']

  for (const orderBySteamid of [false, true]) {
    await t.test(`orderBySteamid ${orderBySteamid}`, () => {
      const expected = nativeTicks(props, ticks, null, orderBySteamid, true)
      const actual = plain(wasmTicks(props, ticks, null, orderBySteamid, true))
      assert.deepEqual(actual, expected)
    })
  }

  const expectedAos = nativeTicks(props, ticks, null, false, false)
  const actualAos = plain(wasmTicks(props, ticks, null, false, false))
  assert.deepEqual(actualAos, expectedAos)
  assert.ok(actualAos.every((row) => row.active_weapon_skin === null))
})

wasmTest('parseTickRange structOfArrays and ordered serialization match native', async (t) => {
  const props = ['health', 'active_weapon_skin']
  const lo = 100
  const hi = 300

  for (const orderBySteamid of [false, true]) {
    await t.test(`orderBySteamid ${orderBySteamid}`, () => {
      const expected = nativeRange(props, lo, hi, null, orderBySteamid, true)
      const actual = plain(wasmRange(props, lo, hi, null, orderBySteamid, true))
      assert.deepEqual(actual, expected)
    })
  }

  const expectedAos = nativeRange(props, lo, hi, null, false, false)
  const actualAos = plain(wasmRange(props, lo, hi, null, false, false))
  assert.deepEqual(actualAos, expectedAos)
  assert.ok(actualAos.every((row) => row.active_weapon_skin === null))
})

wasmTest('unknown propStates props match native', () => {
  const propStates = [{ prop: 'no_such_prop', state: 1 }]
  const expected = nativeTicks(['health'], ticks, propStates)
  const actual = plain(wasmTicks(['health'], ticks, propStates))
  assert.deepEqual(actual, expected)
})

wasmTest('parseTickRange returns no rows when tick_lo exceeds tick_hi, like native', () => {
  const expected = nativeRange(['health'], 300, 100, null)
  const actual = plain(wasmRange(['health'], 300, 100, null))
  assert.deepEqual(actual, expected)
  assert.deepEqual(actual, [])
})

wasmTest('non-array wantedProps and wantedPlayers are rejected like native', () => {
  for (const value of ['health', 42, {}]) {
    assert.throws(
      () => native.parseTicks(demoPath, value, ticks, null, false, false, null),
      /Array length/
    )
    assert.throws(() => wasm.parseTicks(bytes, value, ticks, null, false, false, null), {
      message: 'wantedProps must be an array of strings'
    })
    assert.throws(
      () => native.parseTickRange(demoPath, value, 100, 300, null, false, false, null),
      /Array length/
    )
    assert.throws(
      () => wasm.parseTickRange(bytes, value, 100, 300, null, false, false, null),
      { message: 'wantedProps must be an array of strings' }
    )
  }

  for (const value of ['76561198265366770', 42, {}]) {
    assert.throws(
      () => native.parseTicks(demoPath, ['health'], [100], value, false, false, null),
      /Array length/
    )
    assert.throws(() => wasm.parseTicks(bytes, ['health'], [100], value, false, false, null), {
      message: 'wantedPlayers must be an array of strings'
    })
    assert.throws(
      () => native.parseTickRange(demoPath, ['health'], 100, 300, value, false, false, null),
      /Array length/
    )
    assert.throws(
      () => wasm.parseTickRange(bytes, ['health'], 100, 300, value, false, false, null),
      { message: 'wantedPlayers must be an array of strings' }
    )
  }
})

const wasmListArgCases = [
  {
    name: 'parseEvent wantedPlayerProps',
    label: 'wantedPlayerProps',
    native: (value) => native.parseEvent(demoPath, 'player_death', value),
    wasm: (value) => wasm.parseEvent(bytes, 'player_death', value)
  },
  {
    name: 'parseEvent wantedOtherProps',
    label: 'wantedOtherProps',
    native: (value) => native.parseEvent(demoPath, 'player_death', null, value),
    wasm: (value) => wasm.parseEvent(bytes, 'player_death', null, value)
  },
  {
    name: 'parseEvents eventNames',
    label: 'eventNames',
    native: (value) => native.parseEvents(demoPath, value),
    wasm: (value) => wasm.parseEvents(bytes, value)
  },
  {
    name: 'parseEvents wantedPlayerProps',
    label: 'wantedPlayerProps',
    native: (value) => native.parseEvents(demoPath, ['player_death'], value),
    wasm: (value) => wasm.parseEvents(bytes, ['player_death'], value)
  },
  {
    name: 'parseEvents wantedOtherProps',
    label: 'wantedOtherProps',
    native: (value) => native.parseEvents(demoPath, ['player_death'], null, value),
    wasm: (value) => wasm.parseEvents(bytes, ['player_death'], null, value)
  },
  {
    name: 'parseGrenades extra',
    label: 'extra',
    native: (value) => native.parseGrenades(demoPath, value),
    wasm: (value) => wasm.parseGrenades(bytes, value)
  },
  {
    name: 'parseGrenades grenadeClasses',
    label: 'grenadeClasses',
    native: (value) => native.parseGrenades(demoPath, null, false, null, value),
    wasm: (value) => wasm.parseGrenades(bytes, null, false, null, value)
  },
  {
    name: 'parseWeapons extra',
    label: 'extra',
    native: (value) => native.parseWeapons(demoPath, value),
    wasm: (value) => wasm.parseWeapons(bytes, value)
  }
]

const fileGuardCases = [
  ['parseEvent', (value) => wasm.parseEvent(value, 'player_death')],
  ['parseEvents', (value) => wasm.parseEvents(value, ['player_death'])],
  ['listGameEvents', (value) => wasm.listGameEvents(value)],
  ['listUpdatedFields', (value) => wasm.listUpdatedFields(value)],
  ['parseTicks', (value) => wasm.parseTicks(value, ['health'], [100], null, false, false, null)],
  ['parseTickRange', (value) => wasm.parseTickRange(value, ['health'], 100, 100, null, false, false, null)],
  ['parseGrenades', (value) => wasm.parseGrenades(value, null, false, [100])],
  ['parseWeapons', (value) => wasm.parseWeapons(value, null, [100])],
  ['parseHeader', (value) => wasm.parseHeader(value)],
  ['ChunkParser', (value) => new wasm.ChunkParser(value, 'ticks', [100], { wantedProps: ['health'] })]
]

wasmTest('demo bytes reject non-byte inputs with JsError, not a trap', async (t) => {
  for (const [name, call] of fileGuardCases) {
    for (const [label, value] of [
      ['string', 'demo bytes'],
      ['object', {}],
      ['null', null],
      ['undefined', undefined]
    ]) {
      await t.test(`${name} ${label}`, () => {
        assert.throws(call.bind(null, value), {
          message: 'file must be a Uint8Array or an array of bytes'
        })
      })
    }

    for (const [label, value] of [
      ['byte above 255', [256]],
      ['negative byte', [-1]],
      ['fractional byte', [1.5]],
      ['NaN byte', [NaN]],
      ['Infinity byte', [Infinity]],
      ['string entry', ['1']]
    ]) {
      await t.test(`${name} ${label}`, () => {
        assert.throws(call.bind(null, value), {
          message: 'file entries must be integers between 0 and 255'
        })
      })
    }
  }
})

wasmTest('demo bytes accept Uint8Array, number[], and Node Buffer', () => {
  const expected = plain(wasm.parseHeader(bytes))
  assert.deepEqual(plain(wasm.parseHeader(Array.from(bytes))), expected)
  assert.deepEqual(plain(wasm.parseHeader(Buffer.from(bytes))), expected)
})

wasmTest('non-array event and grenade list arguments are rejected like native', async (t) => {
  for (const { name, label, native: callNative, wasm: callWasm } of wasmListArgCases) {
    for (const value of ['health', 42, {}]) {
      await t.test(`${name} ${typeof value}`, () => {
        assert.throws(() => callNative(value), /Array length/)
        assert.throws(() => callWasm(value), {
          message: `${label} must be an array of strings`
        })
      })
    }
  }
})

wasmTest('non-string event and grenade list entries are rejected like native', async (t) => {
  for (const { name, label, native: callNative, wasm: callWasm } of wasmListArgCases) {
    for (const entry of [42, {}, null, new String('player_death')]) {
      await t.test(`${name} ${entry === null ? 'null' : typeof entry}`, () => {
        assert.throws(() => callNative([entry]), /Failed to convert JavaScript value/)
        assert.throws(() => callWasm([entry]), {
          message: `${label} entries must be strings`
        })
      })
    }
  }
})

const tickListCases = [
  {
    name: 'parseTicks wantedTicks',
    native: (value) => native.parseTicks(demoPath, ['health'], value, null, false, false, null),
    wasm: (value) => wasm.parseTicks(bytes, ['health'], value, null, false, false, null)
  },
  {
    name: 'parseGrenades ticks',
    native: (value) => native.parseGrenades(demoPath, null, false, value),
    wasm: (value) => wasm.parseGrenades(bytes, null, false, value)
  },
  {
    name: 'parseWeapons ticks',
    native: (value) => native.parseWeapons(demoPath, null, value),
    wasm: (value) => wasm.parseWeapons(bytes, null, value)
  }
]

wasmTest('non-array tick lists are rejected like native', async (t) => {
  for (const { name, native: callNative, wasm: callWasm } of tickListCases) {
    for (const [label, value] of [
      ['string', '100'],
      ['number', 100],
      ['object', {}],
      ['Uint8Array', new Uint8Array([100])],
      ['Uint16Array', new Uint16Array([100])],
      ['Uint32Array', new Uint32Array([100])],
      ['Int8Array', new Int8Array([100])],
      ['Int16Array', new Int16Array([100])],
      ['Float64Array', new Float64Array([100])],
      ['BigInt64Array', new BigInt64Array([100n])]
    ]) {
      await t.test(`${name} ${label}`, () => {
        assert.throws(() => callNative(value), /Array length/)
        assert.throws(() => callWasm(value), {
          message: 'wantedTicks must be an Int32Array or an array of integers'
        })
      })
    }
  }
})

wasmTest('non-numeric tick entries are rejected like native', async (t) => {
  for (const { name, native: callNative, wasm: callWasm } of tickListCases) {
    for (const [label, entry] of [
      ['numeric string', '100'],
      ['bigint', 100n],
      ['null', null],
      ['boolean', true]
    ]) {
      await t.test(`${name} ${label}`, () => {
        assert.throws(() => callNative([entry]), /Failed to convert/)
        assert.throws(() => callWasm([entry]), {
          message: 'wantedTicks entries must be numbers'
        })
      })
    }
  }
})

wasmTest('Int32Array ticks are accepted by WASM; native only takes number[]', () => {
  const expected = nativeTicks(['health'], [100], null)
  const actual = plain(wasm.parseTicks(bytes, ['health'], new Int32Array([100]), null, false, false, null))
  assert.deepEqual(actual, expected)

  assert.throws(
    () => native.parseTicks(demoPath, ['health'], new Int32Array([100]), null, false, false, null),
    /Array length/
  )
})

wasmTest('fractional and non-finite tick entries truncate like native', async (t) => {
  for (const [label, value] of [
    ['fraction', [100.5]],
    ['NaN', [NaN]],
    ['Infinity', [Infinity]]
  ]) {
    await t.test(label, () => {
      const expected = native.parseTicks(demoPath, ['health'], value, null, false, false, null)
      assert.deepEqual(
        plain(wasm.parseTicks(bytes, ['health'], value, null, false, false, null)),
        expected
      )
    })
  }
})

// Native converts `number` to `i32` with ECMAScript ToInt32: NaN/Infinity
// become 0, fractions truncate, and out-of-range values wrap modulo 2^32.
// Lock the WASM conversion to that behavior for tick lists and range bounds.
wasmTest('tick list and range conversions match native i32 semantics', async (t) => {
  for (const value of [
    NaN,
    Infinity,
    -Infinity,
    1e20,
    5e9,
    4294967296,
    4294967396,
    -4294967196,
    2147483648,
    -2147483649,
    100.9
  ]) {
    await t.test(String(value), () => {
      assert.deepEqual(
        plain(wasm.parseTicks(bytes, ['health'], [value], null, false, false, null)),
        native.parseTicks(demoPath, ['health'], [value], null, false, false, null)
      )
      assert.deepEqual(
        plain(wasm.parseTickRange(bytes, ['health'], value, value, null, false, false, null)),
        native.parseTickRange(demoPath, ['health'], value, value, null, false, false, null)
      )
    })
  }

  const wrapped = 4294967396
  assert.deepEqual(
    plain(wasm.parseGrenades(bytes, null, false, [wrapped])),
    native.parseGrenades(demoPath, null, false, [wrapped])
  )
  assert.deepEqual(
    plain(wasm.parseWeapons(bytes, null, [wrapped])),
    native.parseWeapons(demoPath, null, [wrapped])
  )
})

wasmTest('Int32Array ticks are accepted by grenades and weapons too', () => {
  assert.deepEqual(
    plain(wasm.parseGrenades(bytes, null, false, new Int32Array([100]))),
    native.parseGrenades(demoPath, null, false, [100])
  )
  assert.deepEqual(
    plain(wasm.parseWeapons(bytes, null, new Int32Array([100]))),
    native.parseWeapons(demoPath, null, [100])
  )
})

wasmTest('null, undefined, and empty tick lists mean all ticks', () => {
  const all = plain(wasm.parseTicks(bytes, ['health'], null, null, false, false, null))
  assert.deepEqual(
    plain(wasm.parseTicks(bytes, ['health'], undefined, null, false, false, null)),
    all
  )
  assert.deepEqual(plain(wasm.parseTicks(bytes, ['health'], [], null, false, false, null)), all)

  const oneTick = plain(wasm.parseTicks(bytes, ['health'], [100], null, false, false, null))
  assert.ok(all.length > oneTick.length)
})

wasmTest('parseEvents requires eventNames like native', () => {
  assert.throws(() => native.parseEvents(demoPath), { message: 'No events provided!' })
  assert.throws(() => wasm.parseEvents(bytes), { message: 'No events provided!' })
  assert.throws(() => native.parseEvents(demoPath, null), { message: 'No events provided!' })
  assert.throws(() => wasm.parseEvents(bytes, null), { message: 'No events provided!' })
})

wasmTest('parseEvent requires a string eventName like native', async (t) => {
  for (const [label, value] of [
    ['missing', undefined],
    ['null', null],
    ['number', 42],
    ['object', {}],
    ['array', ['player_death']],
    ['symbol', Symbol('event')]
  ]) {
    await t.test(label, () => {
      assert.throws(() => native.parseEvent(demoPath, value), /Failed to convert JavaScript value/)
      assert.throws(() => wasm.parseEvent(bytes, value), { message: 'eventName must be a string' })
    })
  }

  assert.deepEqual(plain(wasm.parseEvent(bytes, 'player_death')), native.parseEvent(demoPath, 'player_death'))
})

wasmTest('parseEvent and parseEvents accept gameEventListBytes like native', async (t) => {
  const fallback = new Uint8Array([1, 2, 3])
  const nativeFallback = Buffer.from(fallback)

  for (const event of ['player_death', 'bogus_event']) {
    await t.test(event, () => {
      assert.deepEqual(
        plain(wasm.parseEvent(bytes, event, null, null, fallback)),
        native.parseEvent(demoPath, event, null, null, nativeFallback)
      )
      assert.deepEqual(
        plain(wasm.parseEvents(bytes, [event], null, null, fallback)),
        native.parseEvents(demoPath, [event], null, null, nativeFallback)
      )
    })
  }

  // The tracked demo carries an embedded event list, so fallback bytes have no
  // effect on either binding here (same as native); this locks that parity and
  // the argument pass-through without inventing a demo that lacks one.
  assert.deepEqual(
    plain(wasm.parseEvent(bytes, 'player_death', null, null, fallback)),
    plain(wasm.parseEvent(bytes, 'player_death'))
  )
  assert.deepEqual(
    plain(wasm.parseEvent(bytes, 'player_death', null, null, Array.from(fallback))),
    plain(wasm.parseEvent(bytes, 'player_death'))
  )
})

wasmTest('gameEventListBytes rejects non-byte inputs', async (t) => {
  for (const [label, value] of [
    ['string', 'bytes'],
    ['object', {}]
  ]) {
    await t.test(label, () => {
      assert.throws(() => wasm.parseEvent(bytes, 'player_death', null, null, value), {
        message: 'gameEventListBytes must be a Uint8Array or an array of bytes'
      })
      assert.throws(() => wasm.parseEvents(bytes, ['player_death'], null, null, value), {
        message: 'gameEventListBytes must be a Uint8Array or an array of bytes'
      })
    })
  }

  for (const [label, value] of [
    ['above 255', [256]],
    ['negative', [-1]],
    ['fractional', [1.5]],
    ['string entry', ['1']]
  ]) {
    await t.test(label, () => {
      assert.throws(() => wasm.parseEvent(bytes, 'player_death', null, null, value), {
        message: 'gameEventListBytes entries must be integers between 0 and 255'
      })
      assert.throws(() => wasm.parseEvents(bytes, ['player_death'], null, null, value), {
        message: 'gameEventListBytes entries must be integers between 0 and 255'
      })
    })
  }
})

wasmTest('non-string event names and non-boolean flags are rejected like native', async (t) => {
  await t.test('eventName', () => {
    assert.throws(() => native.parseEvent(demoPath, 42), /Failed to convert JavaScript value/)
    assert.throws(() => wasm.parseEvent(bytes, 42), { message: 'eventName must be a string' })
  })

  const boolCases = [
    ['parseTicks structOfArrays', (v) => native.parseTicks(demoPath, ['health'], [100], null, v, false, null), (v) => wasm.parseTicks(bytes, ['health'], [100], null, v, false, null), 'structOfArrays'],
    ['parseTicks orderBySteamid', (v) => native.parseTicks(demoPath, ['health'], [100], null, false, v, null), (v) => wasm.parseTicks(bytes, ['health'], [100], null, false, v, null), 'orderBySteamid'],
    ['parseTickRange structOfArrays', (v) => native.parseTickRange(demoPath, ['health'], 100, 100, null, v, false, null), (v) => wasm.parseTickRange(bytes, ['health'], 100, 100, null, v, false, null), 'structOfArrays'],
    ['parseTickRange orderBySteamid', (v) => native.parseTickRange(demoPath, ['health'], 100, 100, null, false, v, null), (v) => wasm.parseTickRange(bytes, ['health'], 100, 100, null, false, v, null), 'orderBySteamid'],
    ['parseGrenades grenades', (v) => native.parseGrenades(demoPath, null, v, [100]), (v) => wasm.parseGrenades(bytes, null, v, [100]), 'grenades'],
    ['parseGrenades skipNones', (v) => native.parseGrenades(demoPath, null, false, [100], null, v), (v) => wasm.parseGrenades(bytes, null, false, [100], null, v), 'skipNones']
  ]

  for (const [name, callNative, callWasm, label] of boolCases) {
    await t.test(name, () => {
      assert.throws(() => callNative('yes'), /bool/)
      assert.throws(() => callWasm('yes'), { message: `${label} must be a boolean` })
    })
  }
})

wasmTest('nullish boolean options use native defaults', () => {
  assert.deepEqual(
    plain(wasm.parseTicks(bytes, ['health'], [100], null, null, null, null)),
    native.parseTicks(demoPath, ['health'], [100], null, null, null, null)
  )
  assert.deepEqual(
    plain(wasm.parseTickRange(bytes, ['health'], 100, 100, null, null, null, null)),
    native.parseTickRange(demoPath, ['health'], 100, 100, null, null, null, null)
  )
  assert.deepEqual(
    plain(wasm.parseGrenades(bytes, null, null, [100], null, null)),
    native.parseGrenades(demoPath, null, null, [100], null, null)
  )
})

wasmTest('non-numeric range bounds are rejected like native', async (t) => {
  for (const [label, value] of [
    ['string', '100'],
    ['object', {}],
    ['null', null],
    ['undefined', undefined]
  ]) {
    await t.test(label, () => {
      assert.throws(
        () => native.parseTickRange(demoPath, ['health'], value, 300, null, false, false, null),
        /rust type `i32`/
      )
      assert.throws(
        () => wasm.parseTickRange(bytes, ['health'], value, 300, null, false, false, null),
        { message: 'tickLo must be a number' }
      )
      assert.throws(
        () => native.parseTickRange(demoPath, ['health'], 100, value, null, false, false, null),
        /rust type `i32`/
      )
      assert.throws(
        () => wasm.parseTickRange(bytes, ['health'], 100, value, null, false, false, null),
        { message: 'tickHi must be a number' }
      )
    })
  }

  const expected = native.parseTickRange(demoPath, ['health'], 100.5, 300, null, false, false, null)
  const actual = plain(wasm.parseTickRange(bytes, ['health'], 100.5, 300, null, false, false, null))
  assert.deepEqual(actual, expected)
})

// The declarations type these parameters as arrays (nullable/optional), so the
// runtime must accept `[]`, `null`, and `undefined` as "no filter" and reject
// non-array values instead of iterating them. Native accepts nullish
// wantedPlayers but requires an array for wantedProps, so compare against
// native's empty-array result there.
wasmTest('wantedProps accepts strings, empty, null, and undefined', async (t) => {
  const expected = nativeTicks([], [100], null)
  for (const [label, wantedProps] of [
    ['strings', ['health']],
    ['empty', []],
    ['null', null],
    ['undefined', undefined]
  ]) {
    await t.test(label, () => {
      const expectedRows =
        label === 'strings'
          ? nativeTicks(['health'], [100], null)
          : expected
      assert.deepEqual(
        plain(wasm.parseTicks(bytes, wantedProps, [100], null, false, false, null)),
        expectedRows
      )
      assert.deepEqual(
        plain(wasm.parseTickRange(bytes, wantedProps, 100, 100, null, false, false, null)),
        label === 'strings'
          ? nativeRange(['health'], 100, 100, null)
          : nativeRange([], 100, 100, null)
      )
    })
  }
})

wasmTest('wantedPlayers accepts numeric-string arrays, empty, null, and undefined', async (t) => {
  const unfiltered = nativeTicks(['steamid'], [100], null)
  const steamid = unfiltered[0].steamid

  for (const [label, wantedPlayers] of [
    ['numeric strings', [steamid, '0']],
    ['empty', []],
    ['null', null],
    ['undefined', undefined]
  ]) {
    await t.test(label, () => {
      const expected = native.parseTicks(demoPath, ['steamid'], [100], wantedPlayers, false, false, null)
      const actual = plain(wasm.parseTicks(bytes, ['steamid'], [100], wantedPlayers, false, false, null))
      assert.deepEqual(actual, expected)

      const expectedRange = nativeRange(['steamid'], 100, 100, null)
      const actualRange = plain(
        wasm.parseTickRange(bytes, ['steamid'], 100, 100, wantedPlayers, false, false, null)
      )
      assert.deepEqual(
        actualRange,
        label === 'numeric strings'
          ? native.parseTickRange(demoPath, ['steamid'], 100, 100, wantedPlayers, false, false, null)
          : expectedRange
      )

      if (label === 'numeric strings') {
        assert.ok(actual.length > 0)
        assert.ok(actual.every((row) => row.steamid === steamid))
      }
    })
  }
})

wasmTest('non-string wantedProps and wantedPlayers entries are rejected like native', async (t) => {
  for (const [name, entry] of [
    ['number', 42],
    ['object', {}],
    ['null', null],
    ['boxed string', new String('health')]
  ]) {
    await t.test(`wantedProps ${name}`, () => {
      assert.throws(
        () => native.parseTicks(demoPath, [entry], [100], null, false, false, null),
        /Failed to convert JavaScript value/
      )
      assert.throws(() => wasm.parseTicks(bytes, [entry], [100], null, false, false, null), {
        message: 'wantedProps entries must be strings'
      })
      assert.throws(
        () => native.parseTickRange(demoPath, [entry], 100, 100, null, false, false, null),
        /Failed to convert JavaScript value/
      )
      assert.throws(
        () => wasm.parseTickRange(bytes, [entry], 100, 100, null, false, false, null),
        { message: 'wantedProps entries must be strings' }
      )
    })

    await t.test(`wantedPlayers ${name}`, () => {
      assert.throws(
        () => native.parseTicks(demoPath, ['health'], [100], [entry], false, false, null),
        /Failed to convert JavaScript value/
      )
      assert.throws(
        () => wasm.parseTicks(bytes, ['health'], [100], [entry], false, false, null),
        { message: 'wantedPlayers entries must be strings' }
      )
      assert.throws(
        () => native.parseTickRange(demoPath, ['health'], 100, 100, [entry], false, false, null),
        /Failed to convert JavaScript value/
      )
      assert.throws(
        () => wasm.parseTickRange(bytes, ['health'], 100, 100, [entry], false, false, null),
        { message: 'wantedPlayers entries must be strings' }
      )
    })
  }
})

// Both bindings map unparsable wantedPlayers entries to 0 (`unwrap_or(0)`).
// Lock that parity instead of letting the two sides drift.
wasmTest('invalid wantedPlayers entries match native unwrap-or-zero behavior', () => {
  const playersCases = [
    ['not-a-number'],
    [''],
    [' 76561198265366770'],
    ['-1'],
    ['18446744073709551616'],
    ['0'],
    ['76561198265366770', 'nope']
  ]

  for (const players of playersCases) {
    const expected = native.parseTicks(demoPath, ['steamid'], [100], players, false, false, null)
    const actual = plain(wasm.parseTicks(bytes, ['steamid'], [100], players, false, false, null))
    assert.deepEqual(actual, expected)

    const expectedRange = native.parseTickRange(
      demoPath,
      ['steamid'],
      100,
      100,
      players,
      false,
      false,
      null
    )
    const actualRange = plain(
      wasm.parseTickRange(bytes, ['steamid'], 100, 100, players, false, false, null)
    )
    assert.deepEqual(actualRange, expectedRange)
  }

  const invalid = native.parseTicks(demoPath, ['steamid'], [100], ['not-a-number'], false, false, null)
  const zero = native.parseTicks(demoPath, ['steamid'], [100], ['0'], false, false, null)
  assert.deepEqual(invalid, zero)
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

wasmTest('ChunkParser ticks mode keeps BigInt prop state semantics', () => {
  const rows = []
  const parser = new wasm.ChunkParser(bytes, 'ticks', [80], {
    wantedProps: ['game_time'],
    propStates: [{ prop: 'game_time', state: 71n }]
  })

  let chunk
  while ((chunk = parser.nextChunk()) !== undefined) rows.push(...chunk)

  const expected = nativeTicks(['game_time'], [80], [{ prop: 'game_time', state: 71n }])
  assert.deepEqual(plain(rows), expected)
})

wasmTest('ChunkParser ticks mode keeps u64-max BigInt prop state semantics', () => {
  const state = 18446744073709551615n
  const rows = []
  const parser = new wasm.ChunkParser(bytes, 'ticks', [80], {
    wantedProps: ['game_time'],
    propStates: [{ prop: 'game_time', state }]
  })

  let chunk
  while ((chunk = parser.nextChunk()) !== undefined) rows.push(...chunk)

  const expected = nativeTicks(['game_time'], [80], [{ prop: 'game_time', state }])
  assert.deepEqual(plain(rows), expected)
})

wasmTest('ChunkParser rejects wantedPlayers and orderBySteamid', () => {
  assert.throws(
    () =>
      new wasm.ChunkParser(bytes, 'ticks', ticks, {
        wantedProps: ['health'],
        wantedPlayers: ['76561198265366770']
      }),
    {
      message:
        'ChunkParser does not support wantedPlayers; filter nextChunk rows by steamid or use parseTicks'
    }
  )
  assert.throws(
    () =>
      new wasm.ChunkParser(bytes, 'ticks', ticks, {
        wantedProps: ['health'],
        orderBySteamid: true
      }),
    {
      message: 'ChunkParser does not support orderBySteamid; use parseTicks or parseTickRange'
    }
  )

  const parser = new wasm.ChunkParser(bytes, 'ticks', ticks, {
    wantedProps: ['health'],
    wantedPlayers: [],
    orderBySteamid: false
  })
  parser.free()
})

wasmTest('ChunkParser rejects props that require continuous decode', () => {
  for (const props of [['ducked'], ['velocity_X'], ['ducked', 'velocity_X']]) {
    assert.throws(
      () => new wasm.ChunkParser(bytes, 'ticks', ticks, { wantedProps: props }),
      /continuous decode/
    )
  }
})

wasmTest('ChunkParser treats null, undefined, and empty propStates as unfiltered', () => {
  const collect = (opts) => {
    const rows = []
    const parser = new wasm.ChunkParser(bytes, 'ticks', ticks, opts)
    let chunk
    while ((chunk = parser.nextChunk()) !== undefined) rows.push(...chunk)
    return plain(rows)
  }

  const unfiltered = collect({ wantedProps: ['health'] })
  assert.deepEqual(collect({ wantedProps: ['health'], propStates: null }), unfiltered)
  assert.deepEqual(collect({ wantedProps: ['health'], propStates: undefined }), unfiltered)
  assert.deepEqual(collect({ wantedProps: ['health'], propStates: [] }), unfiltered)
})

wasmTest('ChunkParser rejects non-empty propStates in grenades mode', () => {
  assert.throws(
    () =>
      new wasm.ChunkParser(bytes, 'grenades', null, {
        wantedProps: [],
        propStates: [{ prop: 'health', state: 100 }]
      }),
    {
      message:
        'propStates is only supported in ticks mode; use parseGrenades for grenade state filtering'
    }
  )
})

wasmTest('ChunkParser grenades mode rejects non-empty wantedTicks', async (t) => {
  for (const wantedTicks of [[100], new Int32Array([100]), [NaN]]) {
    await t.test(Array.isArray(wantedTicks) ? 'array' : 'Int32Array', () => {
      assert.throws(
        () => new wasm.ChunkParser(bytes, 'grenades', wantedTicks, { wantedProps: [] }),
        { message: 'ChunkParser grenades mode does not support wantedTicks; use parseGrenades' }
      )
    })
  }

  for (const wantedTicks of [null, undefined, []]) {
    const parser = new wasm.ChunkParser(bytes, 'grenades', wantedTicks, { wantedProps: [] })
    assert.ok(parser.chunkCount > 0)
    parser.free()
  }
})

wasmTest('ChunkParser rejects grenade-only options in ticks mode', () => {
  for (const opts of [
    { wantedProps: ['health'], grenadeClasses: ['CInferno'] },
    { wantedProps: ['health'], nonProjectileGrenades: false },
    { wantedProps: ['health'], skipNones: true }
  ]) {
    assert.throws(() => new wasm.ChunkParser(bytes, 'ticks', null, opts), {
      message:
        'ChunkParser grenade options (grenadeClasses, nonProjectileGrenades, skipNones) are only supported in grenades mode'
    })
  }
})

wasmTest('ChunkParser validates opts shapes like the one-shot binding', async (t) => {
  const cases = [
    ['missing wantedProps', { propStates: [] }, 'ChunkOpts.wantedProps must be an array of strings'],
    ['null wantedProps', { wantedProps: null }, 'ChunkOpts.wantedProps must be an array of strings'],
    [
      'boxed wantedProps entry',
      { wantedProps: [new String('health')] },
      'ChunkOpts.wantedProps entries must be strings'
    ],
    [
      'symbol key',
      { wantedProps: ['health'], [Symbol('extra')]: 1 },
      'ChunkOpts keys must be strings'
    ],
    ['opts array', ['health'], 'ChunkOpts must be an object'],
    ['opts function', () => {}, 'ChunkOpts must be an object'],
    [
      'non-array propStates',
      { wantedProps: ['health'], propStates: Symbol('states') },
      'propStates must be an array of { prop, state } objects'
    ],
    [
      'state undefined',
      { wantedProps: ['health'], propStates: [{ prop: 'health', state: undefined }] },
      'Expected a boolean, string, number, or bigint for a prop state'
    ],
    [
      'boxed state',
      { wantedProps: ['health'], propStates: [{ prop: 'health', state: new Number(100) }] },
      'Expected a boolean, string, number, or bigint for a prop state'
    ],
    [
      'missing prop',
      { wantedProps: ['health'], propStates: [{ state: 100 }] },
      'propStates entries need a string `prop`'
    ],
    [
      'non-object state entry',
      { wantedProps: ['health'], propStates: [42] },
      'propStates entries must be { prop, state } objects'
    ]
  ]

  for (const [label, opts, message] of cases) {
    await t.test(label, () => {
      assert.throws(() => new wasm.ChunkParser(bytes, 'ticks', null, opts), { message })
    })
  }
})

wasmTest('ChunkParser rejects non-boolean option values', async (t) => {
  for (const [label, opts] of [
    ['orderBySteamid', { wantedProps: ['health'], orderBySteamid: 'true' }],
    ['skipNones', { wantedProps: ['health'], skipNones: 1 }],
    ['nonProjectileGrenades', { wantedProps: ['health'], nonProjectileGrenades: 'yes' }]
  ]) {
    await t.test(label, () => {
      assert.throws(() => new wasm.ChunkParser(bytes, 'ticks', null, opts), /invalid opts:/)
    })
  }
})

wasmTest('ChunkParser grenades mode still accepts grenade options', () => {
  for (const opts of [
    { wantedProps: [], grenadeClasses: ['CInferno'] },
    { wantedProps: [], nonProjectileGrenades: false },
    { wantedProps: [], skipNones: true }
  ]) {
    const parser = new wasm.ChunkParser(bytes, 'grenades', null, opts)
    assert.ok(parser.chunkCount > 0)
    parser.free()
  }
})

wasmTest('ChunkParser treats null, undefined, and empty propStates as unfiltered in grenades mode', () => {
  for (const propStates of [null, undefined, []]) {
    const parser = new wasm.ChunkParser(bytes, 'grenades', null, {
      wantedProps: [],
      propStates
    })
    assert.ok(parser.chunkCount > 0)
    parser.free()
  }
})

wasmTest('ChunkParser ticks mode matches native for prefixed and unknown propStates', async (t) => {
  const collect = (opts) => {
    const rows = []
    const parser = new wasm.ChunkParser(bytes, 'ticks', ticks, { wantedProps: ['health'], ...opts })
    let chunk
    while ((chunk = parser.nextChunk()) !== undefined) rows.push(...chunk)
    return plain(rows)
  }

  await t.test('prefixed', () => {
    const propStates = [{ prop: 'Weapon.health', state: 100 }]
    assert.deepEqual(collect({ propStates }), nativeTicks(['health'], ticks, propStates))
  })

  await t.test('unknown', () => {
    const propStates = [{ prop: 'no_such_prop', state: 1 }]
    assert.deepEqual(collect({ propStates }), nativeTicks(['health'], ticks, propStates))
  })
})

wasmTest('ChunkParser rejects non-array wantedPlayers with a clear message', async (t) => {
  for (const value of ['76561198265366770', 42, {}]) {
    await t.test(typeof value, () => {
      assert.throws(
        () =>
          new wasm.ChunkParser(bytes, 'ticks', ticks, {
            wantedProps: ['health'],
            wantedPlayers: value
          }),
        { message: 'ChunkOpts.wantedPlayers must be an array of strings' }
      )
    })
  }

  assert.throws(
    () =>
      new wasm.ChunkParser(bytes, 'ticks', ticks, {
        wantedProps: ['health'],
        wantedPlayers: [42]
      }),
    { message: 'ChunkOpts.wantedPlayers entries must be strings' }
  )
})

wasmTest('ChunkParser rejects non-array wantedProps before continuous decode', async (t) => {
  for (const value of ['ducked', 42, {}]) {
    await t.test(typeof value, () => {
      assert.throws(
        () => new wasm.ChunkParser(bytes, 'ticks', ticks, { wantedProps: value }),
        { message: 'ChunkOpts.wantedProps must be an array of strings' }
      )
    })
  }

  assert.throws(
    () => new wasm.ChunkParser(bytes, 'ticks', ticks, { wantedProps: [42] }),
    { message: 'ChunkOpts.wantedProps entries must be strings' }
  )
})

wasmTest('ChunkParser rejects non-array grenadeClasses', () => {
  assert.throws(
    () =>
      new wasm.ChunkParser(bytes, 'grenades', null, {
        wantedProps: [],
        grenadeClasses: 'CInferno'
      }),
    { message: 'ChunkOpts.grenadeClasses must be an array of strings' }
  )
})

wasmTest('ChunkParser accepts Int32Array wantedTicks', () => {
  const parser = new wasm.ChunkParser(bytes, 'ticks', new Int32Array([100]), {
    wantedProps: ['health']
  })
  assert.ok(parser.chunkCount > 0)
  parser.free()
})

wasmTest('ChunkParser rejects non-array wanted ticks', () => {
  for (const value of [
    '100',
    {},
    new Uint8Array([100]),
    new Uint16Array([100]),
    new Uint32Array([100]),
    new Int8Array([100]),
    new Float64Array([100]),
    new BigInt64Array([100n])
  ]) {
    assert.throws(
      () => new wasm.ChunkParser(bytes, 'ticks', value, { wantedProps: ['health'] }),
      { message: 'wantedTicks must be an Int32Array or an array of integers' }
    )
  }
  assert.throws(
    () => new wasm.ChunkParser(bytes, 'ticks', ['100'], { wantedProps: ['health'] }),
    { message: 'wantedTicks entries must be numbers' }
  )
})

wasmTest('ChunkParser rejects invalid modes and post-free use', () => {
  assert.throws(() => new wasm.ChunkParser(bytes, 'bogus', null, { wantedProps: [] }), {
    message: 'invalid mode "bogus": expected "ticks" or "grenades"'
  })
  for (const mode of [42, null, undefined, {}]) {
    assert.throws(() => new wasm.ChunkParser(bytes, mode, null, { wantedProps: [] }), {
      message: 'mode must be a string'
    })
  }

  const parser = new wasm.ChunkParser(bytes, 'ticks', ticks, { wantedProps: ['health'] })
  parser.free()
  assert.throws(() => parser.nextChunk(), { message: 'ChunkParser has been freed' })
  assert.throws(() => parser.chunkCount, { message: 'ChunkParser has been freed' })
  parser.free()
  assert.throws(() => parser.chunkCount, { message: 'ChunkParser has been freed' })
})

wasmTest('ChunkParser returns empty chunks when no rows match, then undefined', () => {
  const parser = new wasm.ChunkParser(bytes, 'ticks', [-1], { wantedProps: ['health'] })
  assert.ok(parser.chunkCount > 0)

  const chunks = []
  let chunk
  while ((chunk = parser.nextChunk()) !== undefined) chunks.push(chunk)

  assert.equal(chunks.length, parser.chunkCount)
  assert.ok(chunks.every((rows) => Array.isArray(rows) && rows.length === 0))
})

wasmTest('ChunkParser rejects unknown opts fields and non-object opts', () => {
  assert.throws(
    () =>
      new wasm.ChunkParser(bytes, 'ticks', ticks, {
        wantedProps: ['health'],
        bogus: true
      }),
    /unknown field `bogus`/
  )
  assert.throws(() => new wasm.ChunkParser(bytes, 'ticks', ticks, 'not-an-object'), {
    message: 'ChunkOpts must be an object'
  })
})

wasmTest('non-string list arguments return JsError, not a trap', () => {
  assert.throws(() => wasm.parseTicks(bytes, [42], [100], null, false, false, null), {
    message: 'wantedProps entries must be strings'
  })
  assert.throws(() => wasm.parseTicks(bytes, ['health'], [100], [42], false, false, null), {
    message: 'wantedPlayers entries must be strings'
  })
  assert.throws(() => wasm.parseTickRange(bytes, [42], 100, 100, null, false, false, null), {
    message: 'wantedProps entries must be strings'
  })
  assert.throws(() => wasm.parseEvent(bytes, 'player_death', [42]), {
    message: 'wantedPlayerProps entries must be strings'
  })
  assert.throws(() => wasm.parseEvents(bytes, [42]), {
    message: 'eventNames entries must be strings'
  })
  assert.throws(() => wasm.parseGrenades(bytes, [42]), {
    message: 'extra entries must be strings'
  })
  assert.throws(() => wasm.parseWeapons(bytes, [42]), {
    message: 'extra entries must be strings'
  })
})
