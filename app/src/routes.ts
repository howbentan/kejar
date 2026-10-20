export type Route =
  | 'home'
  | 'host-new'
  | 'host-lobby'
  | 'game'
  | 'join'
  | 'print-tags'
  | 'spike-join'
  | 'spike-admin'
  | 'spike-report'
  | 'not-found'

const FIXED: Record<string, Route> = {
  '/': 'home',
  '/host/new': 'host-new',
  '/print/tags': 'print-tags',
  '/spike': 'spike-join',
  '/spike/admin': 'spike-admin',
  '/spike/report': 'spike-report',
}

const WITH_CODE: [RegExp, Route][] = [
  [/^\/host\/([A-Za-z0-9]{6})$/, 'host-lobby'],
  [/^\/g\/([A-Za-z0-9]{6})$/, 'game'],
  [/^\/join\/([A-Za-z0-9]{6})$/, 'join'],
]

export function routeFor(pathname: string): { route: Route; code?: string } {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (FIXED[path]) return { route: FIXED[path] }
  for (const [re, route] of WITH_CODE) {
    const m = re.exec(path)
    if (m) return { route, code: m[1].toUpperCase() }
  }
  return { route: 'not-found' }
}
