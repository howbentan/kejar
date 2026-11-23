// Local test server: the real app, plus the real game server running in memory inside Vite, with a clock the tests
// can fast-forward and a record of every push. For automated playtests only; not part of the app or its deploy.
import react from '@vitejs/plugin-react'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type ViteDevServer } from 'vite'

const root = path.resolve(__dirname, '../..')

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })
}

function localGame() {
  let offset = 0
  let delayMs = 0
  const now = () => Date.now() + offset
  const pushes: { at: number; endpoint: string; payload: unknown }[] = []
  let store: unknown = null
  const setup = async (server: ViteDevServer) => {
    const { MemoryStore } = await server.ssrLoadModule('/api/_lib/store.ts')
    const { hashToken } = await server.ssrLoadModule('/api/_lib/secrets.ts')
    const s = new MemoryStore(now)
    const org = await s.createOrganisation({ name: 'kejar.', created_at: new Date(now()).toISOString() })
    await s.createOrganiser({ organisation_id: org.id, name: 'Owner', created_at: new Date(now()).toISOString(), session_token_hash: hashToken('local-org-token') })
    store = s
  }
  return {
    name: 'local-game',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? ''
        const json = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (url.startsWith('/__clock')) {
          const advance = Number(new URL(url, 'http://x').searchParams.get('advance') ?? 0)
          offset += Number.isFinite(advance) ? advance : 0
          return json(200, { now: now(), offset })
        }
        if (url.startsWith('/__pushes')) return json(200, pushes)
        if (url.startsWith('/__delay')) {
          delayMs = Number(new URL(url, 'http://x').searchParams.get('ms') ?? 0) || 0
          return json(200, { delayMs })
        }
        if (url.startsWith('/__reset')) {
          offset = 0
          pushes.length = 0
          await setup(server)
          return json(200, { ok: true })
        }
        if (!url.startsWith('/api/game') || req.method !== 'POST') return next()
        if (!store) await setup(server)
        const { handle } = await server.ssrLoadModule('/api/_lib/handle.ts')
        const raw = await readBody(req)
        // A slow network on demand, so the loaders wait long enough to play their exits.
        if (delayMs && /"action":"(state|listArenas|listSecretCards|parkFeatures|join|start|createMarshalInvite|searchParks)"/.test(raw)) {
          await new Promise((r) => setTimeout(r, delayMs))
        }
        const t = now()
        const result = await handle(raw, {
          ip: '127.0.0.1',
          ctx: {
            store,
            now: t,
            rng: Math.random,
            push: async (sub: { endpoint?: string }, payload: string) => {
              pushes.push({ at: t, endpoint: sub.endpoint ?? '', payload: JSON.parse(payload) })
            },
            fetchJson: async (u: string, init?: RequestInit) => {
              const r = await fetch(u, init)
              if (!r.ok) throw new Error(`${new URL(u).host} answered ${r.status}`)
              return r.json()
            },
          },
        })
        return json(result.status, result.json)
      })
    },
  }
}

export default defineConfig({
  root,
  plugins: [react(), localGame()],
  server: { port: 5180, strictPort: true },
})
