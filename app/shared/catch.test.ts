import { describe, expect, it } from 'vitest'
import { judgeCatch, judgeJailbreak } from './catch.js'
import { MIN, player, pos, T0 } from './fixtures.js'

const NOW = T0 + 20 * MIN
const ben = player('c1', 'chaser', { name: 'Ben' })
const aina = player('r1', 'runner', { tag_id: 7 })
const hafiz = player('r2', 'runner', { tag_id: 3 })
const players = [ben, aina, hafiz]
const here = pos(3.0, 101.0, NOW - 5_000)
const near = pos(3.0003, 101.0, NOW - 5_000) // ~33 m
const far = pos(3.0006, 101.0, NOW - 5_000) // ~67 m

const base = { phase: 'chasing' as const, chaser: ben, tagId: 7, players, chaserPos: here, runnerPos: near, now: NOW }

describe('judgeCatch', () => {
  it('catch within 50 m succeeds unflagged', () => {
    expect(judgeCatch(base)).toEqual({ ok: true, flagged: false, runnerId: 'r1' })
  })
  it('catch over 50 m with fresh fixes is rejected as too-far', () => {
    expect(judgeCatch({ ...base, runnerPos: far })).toEqual({ ok: false, reason: 'too-far' })
  })
  it('catch with unknown chaser position is allowed but flagged', () => {
    expect(judgeCatch({ ...base, chaserPos: null })).toEqual({ ok: true, flagged: true, runnerId: 'r1' })
  })
  it('catch with a runner position older than 2 min is allowed but flagged, even if far', () => {
    expect(judgeCatch({ ...base, runnerPos: pos(3.01, 101.0, NOW - 3 * MIN) })).toEqual({
      ok: true,
      flagged: true,
      runnerId: 'r1',
    })
  })
  it('second scan of a caught runner is rejected as already caught', () => {
    const caught = { ...aina, jailed: true }
    expect(judgeCatch({ ...base, players: [ben, caught, hafiz] })).toEqual({ ok: false, reason: 'already-caught' })
  })
  it('unknown tag id is rejected', () => {
    expect(judgeCatch({ ...base, tagId: 42 })).toEqual({ ok: false, reason: 'unknown-tag' })
    expect(judgeCatch({ ...base, tagId: null })).toEqual({ ok: false, reason: 'unknown-tag' })
  })
  it('only chasers can catch, only while chasing', () => {
    expect(judgeCatch({ ...base, phase: 'hiding' })).toEqual({ ok: false, reason: 'not-chasing' })
    expect(judgeCatch({ ...base, chaser: hafiz })).toEqual({ ok: false, reason: 'not-a-chaser' })
  })
})

describe('judgeJailbreak', () => {
  const jail = { lat: 3.0, lng: 101.0 }
  const jailedA = player('r3', 'runner', { jailed: true })
  const jailedOnce = player('r4', 'runner', { jailed: true, freed_once: true })
  const all = [ben, aina, hafiz, jailedA, jailedOnce]
  const atJail = pos(3.00018, 101.0, NOW - 5_000) // ~20 m from the jail
  const input = { phase: 'chasing' as const, runner: aina, players: all, runnerPos: atJail, jail }

  it('jailbreak frees jailed runners not freed before', () => {
    expect(judgeJailbreak(input)).toEqual({ ok: true, freedIds: ['r3'] })
  })
  it('jailbreak 40 m from jail is rejected', () => {
    expect(judgeJailbreak({ ...input, runnerPos: pos(3.00036, 101.0, NOW) })).toEqual({
      ok: false,
      reason: 'too-far-from-jail',
    })
  })
  it('needs a known position', () => {
    expect(judgeJailbreak({ ...input, runnerPos: null })).toEqual({ ok: false, reason: 'too-far-from-jail' })
  })
  it('a jailed runner cannot break out others', () => {
    expect(judgeJailbreak({ ...input, runner: jailedA })).toEqual({ ok: false, reason: 'not-a-free-runner' })
  })
  it('says so when nobody can be freed', () => {
    expect(judgeJailbreak({ ...input, players: [ben, aina, jailedOnce] })).toEqual({ ok: false, reason: 'nobody-to-free' })
  })
  it('only while chasing', () => {
    expect(judgeJailbreak({ ...input, phase: 'ended' })).toEqual({ ok: false, reason: 'not-chasing' })
  })
})
