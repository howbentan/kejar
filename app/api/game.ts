import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { PushSubscription } from 'web-push'
import { ActionError, actions, type ActionName } from './_lib/actions.js'
import { configuredWebPush, serverDb } from './_lib/server.js'
import { SupabaseStore } from './_lib/supabaseStore.js'

/** POST /api/game { action, ...body } — the single entry point for every game action. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})) as Record<string, unknown>
  const name = body.action as ActionName
  if (typeof name !== 'string' || !Object.hasOwn(actions, name)) return res.status(400).json({ error: 'Unknown action' })
  try {
    const webpush = configuredWebPush()
    // One clock for the whole request: game rules and stored timestamps must agree.
    const now = Date.now()
    const result = await actions[name](
      {
        store: new SupabaseStore(serverDb(), () => now),
        now,
        rng: Math.random,
        push: async (sub, payload) => {
          await webpush.sendNotification(sub as PushSubscription, payload, { TTL: 60, urgency: 'high' })
        },
      },
      body,
    )
    return res.status(200).json(result)
  } catch (e) {
    if (e instanceof ActionError) return res.status(e.status).json({ error: e.message })
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
