export type Route =
  | 'home'
  | 'host-new'
  | 'host-kit'
  | 'host-lobby'
  | 'host-walk'
  | 'game'
  | 'join'
  | 'print-tags'
  | 'print-card'
  | 'organiser-redeem'
  | 'marshal-redeem'
  | 'not-found'

const FIXED: Record<string, Route> = {
  '/': 'home',
  '/host/new': 'host-new',
  '/host/kit': 'host-kit',
  '/print/tags': 'print-tags',
  '/print/card': 'print-card',
}

const WITH_CODE: [RegExp, Route][] = [
  [/^\/host\/([A-Za-z0-9]{6})$/, 'host-lobby'],
  [/^\/host\/([A-Za-z0-9]{6})\/walk$/, 'host-walk'],
  [/^\/g\/([A-Za-z0-9]{6})$/, 'game'],
  [/^\/join\/([A-Za-z0-9]{6})$/, 'join'],
]

const ORGANISER_REDEEM = /^\/organiser\/([A-Za-z0-9_-]+)$/
const MARSHAL_REDEEM = /^\/m\/([A-Za-z0-9]{6})\/([A-Za-z0-9_-]+)$/

export function routeFor(pathname: string): { route: Route; code?: string; token?: string } {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (FIXED[path]) return { route: FIXED[path] }
  for (const [re, route] of WITH_CODE) {
    const m = re.exec(path)
    if (m) return { route, code: m[1].toUpperCase() }
  }
  const o = ORGANISER_REDEEM.exec(path)
  if (o) return { route: 'organiser-redeem', token: o[1] }
  const ma = MARSHAL_REDEEM.exec(path)
  if (ma) return { route: 'marshal-redeem', code: ma[1].toUpperCase(), token: ma[2] }
  return { route: 'not-found' }
}
