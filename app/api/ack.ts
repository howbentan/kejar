import type { VercelRequest, VercelResponse } from '@vercel/node'
import { serverDb } from './_lib/server.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const { pingId, deviceId } = body as { pingId?: string; deviceId?: string }
  if (!pingId || !deviceId) return res.status(400).json({ error: 'pingId and deviceId are required' })
  try {
    // received_at defaults to now() on the server: phone clocks are never trusted.
    const { error } = await serverDb()
      .from('spike_acks')
      .upsert({ ping_id: pingId, device_id: deviceId }, { onConflict: 'ping_id,device_id', ignoreDuplicates: true })
    if (error) throw error
    return res.status(204).end()
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
