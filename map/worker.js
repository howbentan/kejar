// Serves our Malaysia + Singapore map file from R2 to the Kejar app: byte ranges (PMTiles reads small pieces), cached
// at Cloudflare's edge, and only for Kejar's own pages. Deploy: see README.md.

const ALLOWED = [/^https:\/\/kejar-eosin\.vercel\.app$/, /^https:\/\/kejar-[a-z0-9-]+\.vercel\.app$/, /^http:\/\/localhost(:\d+)?$/]

const corsFor = (origin) =>
  origin && ALLOWED.some((r) => r.test(origin))
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, If-Match',
        'Access-Control-Expose-Headers': 'ETag, Content-Range, Content-Length',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : null

export default {
  async fetch(req, env, ctx) {
    const cors = corsFor(req.headers.get('Origin'))
    if (!cors) return new Response('Not allowed', { status: 403 })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: cors })

    const key = new URL(req.url).pathname.slice(1)
    if (!/^[a-z0-9-]+\.pmtiles$/.test(key)) return new Response('Not found', { status: 404, headers: cors })

    // Edge cache keyed on the file and the byte range (the Range header isn't part of a cache key by itself).
    const range = req.headers.get('Range') ?? ''
    const cacheKey = new Request(`https://map-cache/${key}?r=${encodeURIComponent(range)}`)
    const cache = caches.default
    let res = await cache.match(cacheKey)
    if (!res) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(range)
      const obj = await env.MAP.get(key, m ? { range: { offset: +m[1], ...(m[2] ? { length: +m[2] - +m[1] + 1 } : {}) } } : {})
      if (!obj) return new Response('Not found', { status: 404, headers: cors })
      const headers = new Headers({ 'Content-Type': 'application/vnd.pmtiles', ETag: obj.httpEtag, 'Cache-Control': 'public, max-age=86400' })
      if (m) {
        const end = obj.range.offset + obj.range.length - 1
        headers.set('Content-Range', `bytes ${obj.range.offset}-${end}/${obj.size}`)
      }
      res = new Response(obj.body, { status: m ? 206 : 200, headers })
      // The Cache API won't store 206s, so store it as a 200 and restore the status on the way out.
      ctx.waitUntil(cache.put(cacheKey, new Response(res.clone().body, { status: 200, headers })))
    } else if (range) {
      res = new Response(res.body, { status: 206, headers: res.headers })
    }
    const out = new Response(req.method === 'HEAD' ? null : res.body, res)
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v)
    return out
  },
}
