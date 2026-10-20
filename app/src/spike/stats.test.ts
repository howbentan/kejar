import { describe, expect, it } from 'vitest'
import { passesBar, summarise } from './stats'
import type { Ack, Checkin, Device, Ping, Platform } from './types'

const T0 = Date.parse('2026-10-25T09:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

function device(id: string, platform: Platform, createdAt = T0): Device {
  return { id, label: id, platform, subscription: { endpoint: 'https://x/' + id }, active: true, created_at: iso(createdAt) }
}

function pings(n: number): Ping[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, sent_at: iso(T0 + 60_000 + i * 300_000), sent_count: 4 }))
}

/** Every device acks every ping after 2 s, except where `delayMs` overrides; `missing` skips acks. */
function acks(devices: Device[], ps: Ping[], opts: { delayMs?: Record<string, number>; missing?: Set<string> } = {}): Ack[] {
  const out: Ack[] = []
  for (const d of devices)
    for (const p of ps) {
      const key = `${d.id}:${p.id}`
      if (opts.missing?.has(key)) continue
      out.push({ ping_id: p.id, device_id: d.id, received_at: iso(Date.parse(p.sent_at) + (opts.delayMs?.[key] ?? 2000)) })
    }
  return out
}

const four = [device('i1', 'ios'), device('i2', 'ios'), device('a1', 'android'), device('a2', 'android')]
const noCheckins: Checkin[] = []

describe('passesBar', () => {
  it('passes at 39/40 within 15 s across 2 iPhones and 2 Androids', () => {
    const ps = pings(10)
    const stats = summarise(four, ps, acks(four, ps, { delayMs: { 'a1:p3': 20_000 } }), noCheckins)
    const bar = passesBar(stats)
    expect(bar.arrivalRate).toBeCloseTo(0.975)
    expect(bar.pass).toBe(true)
    expect(bar.reasons).toEqual([])
  })

  it('fails at 80% and says why', () => {
    const ps = pings(10)
    const missing = new Set(four.flatMap((d) => [`${d.id}:p0`, `${d.id}:p1`]))
    const bar = passesBar(summarise(four, ps, acks(four, ps, { missing }), noCheckins))
    expect(bar.pass).toBe(false)
    expect(bar.reasons).toContain('Only 80% of alerts arrived within 15 s (need 90%)')
  })

  it('fails with only one iPhone', () => {
    const three = [four[0], four[2], four[3]]
    const ps = pings(10)
    const bar = passesBar(summarise(three, ps, acks(three, ps), noCheckins))
    expect(bar.pass).toBe(false)
    expect(bar.iosDevices).toBe(1)
    expect(bar.reasons).toContain('Need at least 2 iPhones (have 1)')
  })

  it('fails with no pings at all instead of dividing by zero', () => {
    const bar = passesBar(summarise(four, [], [], noCheckins))
    expect(bar.pass).toBe(false)
    expect(bar.arrivalRate).toBe(0)
    expect(bar.reasons).toContain('No pings sent yet')
  })
})

describe('summarise', () => {
  it('does not count pings sent before a device registered', () => {
    const late = device('late', 'android', T0 + 60_000 + 5 * 300_000)
    const ps = pings(10)
    const [stats] = summarise([late], ps, acks([late], ps.slice(5)), noCheckins)
    expect(stats.pings).toBe(5)
    expect(stats.arrived).toBe(5)
  })

  it('gives a null median for a device with no acks', () => {
    const [stats] = summarise([four[0]], pings(3), [], noCheckins)
    expect(stats.medianArrivalMs).toBeNull()
    expect(stats.arrived).toBe(0)
  })

  it('counts check-ins and those with a location', () => {
    const ps = pings(2)
    const checkins: Checkin[] = [
      { ping_id: 'p0', device_id: 'i1', created_at: iso(T0), lat: 3.1, lng: 101.6, accuracy_m: 10, error: null },
      { ping_id: 'p1', device_id: 'i1', created_at: iso(T0), lat: null, lng: null, accuracy_m: null, error: 'denied' },
    ]
    const [stats] = summarise([four[0]], ps, acks([four[0]], ps, { delayMs: { 'i1:p0': 1000, 'i1:p1': 3000 } }), checkins)
    expect(stats.checkins).toBe(2)
    expect(stats.checkinsWithLocation).toBe(1)
    expect(stats.medianArrivalMs).toBe(2000)
  })
})
