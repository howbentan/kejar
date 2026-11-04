import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { PushSubscription } from 'web-push'
import { handle } from './_lib/handle.js'
import { OSM_TIMEOUT_MS } from './_lib/osm.js'
import { cryptoRng } from './_lib/secrets.js'
import { configuredWebPush, serverDb } from './_lib/server.js'
import { SupabaseStore } from './_lib/supabaseStore.js'

const header = (req: VercelRequest, name: string) => {
  const v = req.headers[name]
  return (Array.isArray(v) ? v[0] : v)?.trim() || null
}

/** The caller's address: Vercel's x-real-ip, else the first x-forwarded-for entry. */
function clientIp(req: VercelRequest): string | null {
  return header(req, 'x-real-ip') ?? header(req, 'x-forwarded-for')?.split(',')[0]?.trim() ?? null
}

/** POST /api/game { action, ...body } — the single entry point for every game action. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  // One clock for the whole request: game rules and stored timestamps must agree.
  const now = Date.now()
  const { status, json } = await handle(req.body, {
    ip: clientIp(req),
    ctx: {
      store: new SupabaseStore(serverDb(), () => now),
      now,
      rng: cryptoRng,
      push: async (sub, payload) => {
        await configuredWebPush().sendNotification(sub as PushSubscription, payload, { TTL: 60, urgency: 'high' })
      },
      // OpenStreetMap lookups for park setup; a slow public service mustn't hang the request.
      fetchJson: async (url, init) => {
        const r = await fetch(url, { ...init, signal: AbortSignal.timeout(OSM_TIMEOUT_MS) })
        if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`)
        return r.json()
      },
    },
  })
  return res.status(status).json(json)
}
