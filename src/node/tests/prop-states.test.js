import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { parseTicks } from '../index.js'

const demo = fileURLToPath(new URL('../../parser/test_demo.dem', import.meta.url))
const ticks = [50, 100, 200, 300, 400, 500]

const parse = (propStates) =>
  parseTicks(demo, ['team_name'], ticks, null, false, false, propStates)

const parseFilter = (props, wantedTicks, propStates) =>
  parseTicks(demo, props, wantedTicks, null, false, false, propStates)

test('duplicate prop state keys are rejected', () => {
  assert.throws(
    () =>
      parse([
        { prop: 'team_name', state: 'CT' },
        { prop: 'team_name', state: 'TERRORIST' }
      ]),
    /Duplicate prop state/
  )
})

test('alias collisions are rejected', () => {
  assert.throws(
    () =>
      parse([
        { prop: 'team_name', state: 'CT' },
        { prop: 'CCSTeam.m_szTeamname', state: 'TERRORIST' }
      ]),
    /same real name/
  )
})

test('WantedPropState requires both prop and state', () => {
  assert.throws(() => parse([{ prop: 'team_name' }]), /state/)
  assert.throws(() => parse([{ state: 'CT' }]), /prop/)
})

test('non-finite prop state numbers are rejected', () => {
  assert.throws(() => parse([{ prop: 'team_name', state: NaN }]), /finite/)
  assert.throws(() => parse([{ prop: 'team_name', state: Infinity }]), /finite/)
})

test('integers above u32::MAX must be BigInt', () => {
  assert.throws(() => parse([{ prop: 'team_name', state: 4294967296 }]), /BigInt/)
})

test('numeric prop state keeps only ticks where every player matches', () => {
  const all = parseFilter(['health'], ticks, null)
  const matching = parseFilter(['health'], ticks, [{ prop: 'health', state: 100 }])
  assert.ok(all.length > 0)
  assert.ok(matching.length > 0)
  assert.ok(matching.length < all.length)
  assert.ok(matching.every((row) => row.health === 100))
  assert.ok(matching.every((row) => !all.some((other) => other.tick === row.tick && other.health !== 100)))
})

test('non-matching numeric state drops every row', () => {
  assert.equal(parseFilter(['health'], ticks, [{ prop: 'health', state: 0 }]).length, 0)
})

test('integer and BigInt states match a float prop', () => {
  const asNumber = parseFilter(['game_time'], [80], [{ prop: 'game_time', state: 71 }])
  assert.ok(asNumber.length > 0)
  assert.ok(asNumber.every((row) => row.game_time === 71))

  const asBigInt = parseFilter(['game_time'], [80], [{ prop: 'game_time', state: 71n }])
  assert.deepEqual(asBigInt, asNumber)
})

test('boolean prop state filters rows', () => {
  const matching = parseFilter(['is_bomb_planted'], [8500], [{ prop: 'is_bomb_planted', state: true }])
  assert.ok(matching.length > 0)
  assert.ok(matching.every((row) => row.is_bomb_planted === true))
  assert.equal(parseFilter(['is_bomb_planted'], [100], [{ prop: 'is_bomb_planted', state: true }]).length, 0)
})

test('string prop state filters rows', () => {
  const all = parseFilter(['clan_name'], [100], null)
  assert.ok(all.length > 0)
  const matching = parseFilter(['clan_name'], [100], [{ prop: 'clan_name', state: all[0].clan_name }])
  assert.deepEqual(matching, all)
  assert.equal(parseFilter(['clan_name'], [100], [{ prop: 'clan_name', state: 'no-such-clan' }]).length, 0)
})
