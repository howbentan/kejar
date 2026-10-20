import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { PushSubscription } from 'web-push'
import type { Device } from '../src/spike/types.js'
import { sendPingToDevices } from './_lib/ping.js'
import { configuredWebPush, serverDb } from './_lib/server.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const db = serverDb()
    const webpush = configuredWebPush()

    const { data: devices, error } = await db.from('spike_devices').select('*').eq('active', true)
    if (error) throw error
    if (!devices || devices.length === 0) {
      return res.status(200).json({ pingId: null, sent: 0, expired: [], failed: [] })
    }

    // Insert the ping first so sent_at is the server time before any push goes out.
    const { data: ping, error: pingError } = await db.from('spike_pings').insert({}).select('id').single()
    if (pingError) throw pingError

    const result = await sendPingToDevices(ping.id, devices as Device[], async (subscription, payload) => {
      await webpush.sendNotification(subscription as PushSubscription, payload, { TTL: 60, urgency: 'high' })
    })

    await db.from('spike_pings').update({ sent_count: result.sent }).eq('id', ping.id)
    if (result.expired.length > 0) {
      await db.from('spike_devices').update({ active: false }).in('id', result.expired)
    }
    return res.status(200).json({ pingId: ping.id, ...result })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
