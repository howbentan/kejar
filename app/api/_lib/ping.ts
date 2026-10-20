import type { Device } from '../../src/spike/types.js'

/** Sends one push. Rejects with an object carrying the push service's statusCode on failure. */
export type Sender = (subscription: PushSubscriptionJSON, payload: string) => Promise<void>

export interface SendResult {
  sent: number
  expired: string[]
  failed: string[]
}

export async function sendPingToDevices(pingId: string, devices: Device[], send: Sender): Promise<SendResult> {
  const results = await Promise.allSettled(
    devices.map((d) => send(d.subscription, JSON.stringify({ pingId, deviceId: d.id }))),
  )
  const out: SendResult = { sent: 0, expired: [], failed: [] }
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      out.sent++
      return
    }
    const status = (r.reason as { statusCode?: number } | undefined)?.statusCode
    if (status === 404 || status === 410) out.expired.push(devices[i].id)
    else out.failed.push(devices[i].id)
  })
  return out
}
