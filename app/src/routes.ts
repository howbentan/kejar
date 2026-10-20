export type Route = 'home' | 'spike-join' | 'spike-admin' | 'spike-report' | 'not-found'

const ROUTES: Record<string, Route> = {
  '/': 'home',
  '/spike': 'spike-join',
  '/spike/admin': 'spike-admin',
  '/spike/report': 'spike-report',
}

export function routeFor(pathname: string): Route {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return ROUTES[path] ?? 'not-found'
}
