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
    ['null', null]
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
  for (const players of [['not-a-number'], ['0'], ['76561198265366770', 'nope']]) {
    const expected = native.parseTicks(demoPath, ['steamid'], [100], players, false, false, null)
    const actual = plain(wasm.parseTicks(bytes, ['steamid'], [100], players, false, false, null))
    assert.deepEqual(actual, expected)
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
  for (const prop of ['ducked', 'velocity_X']) {
    assert.throws(
      () => new wasm.ChunkParser(bytes, 'ticks', ticks, { wantedProps: [prop] }),
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
