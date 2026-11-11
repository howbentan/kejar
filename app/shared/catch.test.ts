import { describe, expect, it } from 'vitest'
import { judgeCatch, judgeJailbreak, plausibleLimitM } from './catch.js'
import { MIN, player, pos, T0 } from './fixtures.js'

const NOW = T0 + 20 * MIN
const ben = player('c1', 'chaser', { name: 'Ben' })
const aina = player('r1', 'runner', { tag_id: 7 })
const hafiz = player('r2', 'runner', { tag_id: 3 })
const players = [ben, aina, hafiz]
const here = pos(3.0, 101.0, NOW - 5_000)
const near = pos(3.0003, 101.0, NOW - 5_000) // ~33 m
const far = pos(3.0008, 101.0, NOW - 5_000) // ~89 m: beyond 50 m plus both GPS errors

const base = { phase: 'chasing' as const, chaser: ben, tagId: 7, players, chaserPos: here, runnerPos: near, now: NOW, shieldings: [] as { chaserId: string; runnerId: string; at: number }[] }

describe('judgeCatch and Durian', () => {
  const stung = { chaserId: 'c1', runnerId: 'r1', at: NOW - 1_000 }
  it('the stung chaser is locked off that runner at +1 s and at +30 min', () => {
    expect(judgeCatch({ ...base, shieldings: [stung] })).toEqual({ ok: false, reason: 'durian-locked' })
    expect(judgeCatch({ ...base, now: NOW + 30 * MIN - 1_000, chaserPos: pos(3.0, 101.0, NOW + 30 * MIN - 5_000), shieldings: [stung] })).toEqual({
      ok: false,
      reason: 'durian-locked',
    })
  })
  it('another chaser gets a 15 s head start refusal at +14 s and is accepted at +16 s', () => {
    const kim = player('c2', 'chaser', { name: 'Kim' })
    const s = { chaserId: 'c1', runnerId: 'r1', at: NOW }
    const as = (ms: number) => judgeCatch({ ...base, chaser: kim, players: [...players, kim], now: NOW + ms, chaserPos: pos(3.0, 101.0, NOW + ms - 1_000), runnerPos: pos(3.0003, 101.0, NOW + ms - 1_000), shieldings: [s] })
    expect(as(14_000)).toEqual({ ok: false, reason: 'durian-head-start' })
    expect(as(16_000)).toMatchObject({ ok: true })
  })
  it('an unrelated runner is unaffected', () => {
    const other = { chaserId: 'c1', runnerId: 'r2', at: NOW - 1_000 }
    expect(judgeCatch({ ...base, shieldings: [other] })).toEqual({ ok: true, flagged: false, runnerId: 'r1' })
  })
})

describe('judgeCatch', () => {
  it('catch within 50 m succeeds unflagged', () => {
    expect(judgeCatch(base)).toEqual({ ok: true, flagged: false, runnerId: 'r1' })
  })
  it('catch over 50 m with fresh fixes is rejected as too-far', () => {
    expect(judgeCatch({ ...base, runnerPos: far })).toEqual({ ok: false, reason: 'too-far' })
  })
  it('a chaser with no recent location cannot catch (stops catching from photos of tags)', () => {
    expect(judgeCatch({ ...base, chaserPos: null })).toEqual({ ok: false, reason: 'no-location' })
    expect(judgeCatch({ ...base, chaserPos: pos(3.0, 101.0, NOW - 2 * MIN) })).toEqual({ ok: false, reason: 'no-location' })
  })
  it('a runner who moved since their last check-in can still be caught', () => {
    const lastCheckIn = pos(3.002, 101.0, NOW - 90_000) // ~220 m away, 90 s old
    expect(judgeCatch({ ...base, runnerPos: lastCheckIn })).toEqual({ ok: true, flagged: false, runnerId: 'r1' })
  })
  it('allows for GPS error on both phones', () => {
    const runner = { ...pos(3.0005, 101.0, NOW - 5_000), accuracy_m: 15 } // ~56 m, ±15 m
    expect(judgeCatch({ ...base, runnerPos: runner })).toEqual({ ok: true, flagged: false, runnerId: 'r1' })
  })
  // 0 accuracy so the limits below are exact: 50 + 6 m/s * age.
  const at0 = (m: number, ageMs: number) => ({ ...pos(3.0 + m / 111_195, 101.0, NOW - ageMs), accuracy_m: 0 })
  const chaser0 = { ...pos(3.0, 101.0, NOW - 5_000), accuracy_m: 0 }
  const judgeAt = (m: number, ageMs: number) => judgeCatch({ ...base, chaserPos: chaser0, runnerPos: at0(m, ageMs) })
  it('a 10 s-old runner fix at 49 m is accepted unflagged', () => {
    expect(judgeAt(49, 10_000)).toEqual({ ok: true, flagged: false, runnerId: 'r1' })
  })
  it('a 120 s-old runner fix has a 770 m limit: 600 m fine, 700 m flagged, 800 m implausible', () => {
    expect(judgeAt(600, 120_000)).toEqual({ ok: true, flagged: false, runnerId: 'r1' })
    expect(judgeAt(700, 120_000)).toEqual({ ok: true, flagged: true, runnerId: 'r1' })
    expect(judgeAt(800, 120_000)).toEqual({ ok: false, reason: 'implausible' })
  })
  it('a runner fix older than 10 min uses the 10 min cap (3,650 m)', () => {
    expect(judgeAt(3_000, 20 * MIN)).toMatchObject({ ok: true })
    expect(judgeAt(4_000, 20 * MIN)).toEqual({ ok: false, reason: 'implausible' })
  })
  it('a runner with no fix at all is accepted unflagged', () => {
    expect(judgeCatch({ ...base, runnerPos: null })).toEqual({ ok: true, flagged: false, runnerId: 'r1' })
  })
  it('a 10 s-old fix at 80 m is still too-far', () => {
    expect(judgeAt(80, 10_000)).toEqual({ ok: false, reason: 'too-far' })
  })
  it('plausibleLimitM adds both accuracies and the capped runner travel', () => {
    const c = { ...pos(3.0, 101.0, NOW), accuracy_m: 50 }
    const r = { ...pos(3.0, 101.0, NOW - 30 * MIN), accuracy_m: 5 }
    expect(plausibleLimitM(c, r, NOW)).toBe(50 + 20 + 5 + 6 * 600)
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
  const input = { phase: 'chasing' as const, runner: aina, players: all, runnerPos: atJail, jail, now: NOW }

  it('jailbreak frees jailed runners not freed before', () => {
    expect(judgeJailbreak(input)).toEqual({ ok: true, freedIds: ['r3'] })
  })
  it('jailbreak 40 m from jail is rejected', () => {
    expect(judgeJailbreak({ ...input, runnerPos: pos(3.00036, 101.0, NOW) })).toEqual({
      ok: false,
      reason: 'too-far-from-jail',
    })
  })
  it('an earlier position near the jail does not count', () => {
    expect(judgeJailbreak({ ...input, runnerPos: pos(3.00018, 101.0, NOW - 2 * MIN) })).toEqual({
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

describe('judgeCatch and Luar Garisan', () => {
  const dq = { disqualified_at: new Date(NOW - MIN).toISOString() }
  it('refuses a disqualified chaser', () => {
    expect(judgeCatch({ ...base, chaser: { ...ben, ...dq } })).toEqual({ ok: false, reason: 'disqualified' })
  })
  it('refuses a disqualified runner as already out', () => {
    expect(judgeCatch({ ...base, players: [ben, { ...aina, ...dq }, hafiz] })).toEqual({ ok: false, reason: 'already-out' })
  })
})

describe('jailbreak and Settle skip a disqualified player', () => {
  const dq = { ...aina, disqualified_at: new Date(NOW - MIN).toISOString() }
  const jail = { lat: 3.0, lng: 101.0 }
  it('a jailbreak has nobody to free when the only other runner is disqualified', () => {
    expect(judgeJailbreak({ phase: 'chasing', runner: hafiz, players: [ben, dq, hafiz], runnerPos: here, jail, now: NOW })).toEqual({
      ok: false,
      reason: 'nobody-to-free',
    })
  })
  it('a disqualified runner cannot jailbreak', () => {
    expect(judgeJailbreak({ phase: 'chasing', runner: dq, players: [ben, dq, hafiz], runnerPos: here, jail, now: NOW })).toEqual({
      ok: false,
      reason: 'not-a-free-runner',
    })
  })
})
