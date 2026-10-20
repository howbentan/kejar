import type { Ack, Checkin, Device, Ping, Platform } from './types'

/** Spec §7: an alert counts as on time if it reaches the phone within 15 s. */
export const ON_TIME_MS = 15_000
/** Spec §7: at least 90% of alerts must be on time. */
export const PASS_RATE = 0.9
/** Spec §7: at least 2 iPhones and 2 Androids. */
export const MIN_PER_PLATFORM = 2

export interface DeviceStats {
  deviceId: string
  label: string
  platform: Platform
  pings: number
  arrivedWithin15s: number
  arrived: number
  checkins: number
  checkinsWithLocation: number
  medianArrivalMs: number | null
}

export interface BarResult {
  pass: boolean
  arrivalRate: number
  iosDevices: number
  androidDevices: number
  reasons: string[]
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function summarise(devices: Device[], pings: Ping[], acks: Ack[], checkins: Checkin[]): DeviceStats[] {
  const pingSent = new Map(pings.map((p) => [p.id, Date.parse(p.sent_at)]))
  return devices.map((d) => {
    const registered = Date.parse(d.created_at)
    const counted = new Set(pings.filter((p) => Date.parse(p.sent_at) >= registered).map((p) => p.id))
    const delays = acks
      .filter((a) => a.device_id === d.id && counted.has(a.ping_id))
      .map((a) => Date.parse(a.received_at) - (pingSent.get(a.ping_id) ?? 0))
    const mine = checkins.filter((c) => c.device_id === d.id && counted.has(c.ping_id))
    return {
      deviceId: d.id,
      label: d.label,
      platform: d.platform,
      pings: counted.size,
      arrived: delays.length,
      arrivedWithin15s: delays.filter((ms) => ms <= ON_TIME_MS).length,
      checkins: mine.length,
      checkinsWithLocation: mine.filter((c) => c.lat !== null && c.lng !== null).length,
      medianArrivalMs: median(delays),
    }
  })
}

export function passesBar(stats: DeviceStats[]): BarResult {
  const totalPings = stats.reduce((n, s) => n + s.pings, 0)
  const onTime = stats.reduce((n, s) => n + s.arrivedWithin15s, 0)
  const arrivalRate = totalPings === 0 ? 0 : onTime / totalPings
  const tested = stats.filter((s) => s.pings >= 1)
  const iosDevices = tested.filter((s) => s.platform === 'ios').length
  const androidDevices = tested.filter((s) => s.platform === 'android').length

  const reasons: string[] = []
  if (totalPings === 0) reasons.push('No pings sent yet')
  else if (arrivalRate < PASS_RATE)
    reasons.push(`Only ${Math.round(arrivalRate * 100)}% of alerts arrived within 15 s (need ${PASS_RATE * 100}%)`)
  if (iosDevices < MIN_PER_PLATFORM) reasons.push(`Need at least ${MIN_PER_PLATFORM} iPhones (have ${iosDevices})`)
  if (androidDevices < MIN_PER_PLATFORM)
    reasons.push(`Need at least ${MIN_PER_PLATFORM} Android phones (have ${androidDevices})`)

  return { pass: reasons.length === 0, arrivalRate, iosDevices, androidDevices, reasons }
}
