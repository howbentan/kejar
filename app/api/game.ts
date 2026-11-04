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
  // @vercel/node parses a JSON body lazily, so reading req.body throws on a malformed one: that's the
  // caller's mistake (400), not a setup failure, and there's nothing worth logging.
  let raw: unknown
  try {
    raw = req.body
  } catch {
    return res.status(400).json({ error: 'Bad request' })
  }
  // One clock for the whole request: game rules and stored timestamps must agree.
  const now = Date.now()
  let result
  try {
    // Built inside the try: a missing Supabase setting must answer our JSON 500, not the platform's page.
    const store = new SupabaseStore(serverDb(), () => now)
    result = await handle(raw, {
      ip: clientIp(req),
      ctx: {
        store,
        now,
        rng: cryptoRng,
        push: async (sub, payload) => {
          let webpush
          try {
            webpush = configuredWebPush()
          } catch (e) {
            console.error('[api/game] web-push not configured', e)
            throw e
          }
          await webpush.sendNotification(sub as PushSubscription, payload, { TTL: 60, urgency: 'high' })
        },
        // OpenStreetMap lookups for park setup; a slow public service mustn't hang the request.
        fetchJson: async (url, init) => {
          const r = await fetch(url, { ...init, signal: AbortSignal.timeout(OSM_TIMEOUT_MS) })
          if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`)
          return r.json()
        },
      },
    })
  } catch (e) {
    console.error('[api/game]', 'setup', e)
    result = { status: 500, json: { error: 'Something went wrong — try again' } }
  }
  const { status, json } = result
  return res.status(status).json(json)
}
