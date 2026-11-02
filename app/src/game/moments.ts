import { MOMENT_WINDOW_MS } from '../../shared/moments.js'

export { MOMENT_WINDOW_MS }

/** True once per `key` and time, and only while it's fresh. Marks it played (spec Review Focus 1). */
export function shouldPlay(key: string, at: string | null, now: number, store: Storage): boolean {
  if (!at) return false
  const t = Date.parse(at)
  if (!(now - t >= 0 && now - t < MOMENT_WINDOW_MS)) return false
  const k = `kejar.moment.${key}.${at}`
  try {
    if (store.getItem(k)) return false
    store.setItem(k, '1')
  } catch {
    // Storage blocked: play it; at worst it replays on a reload.
  }
  return true
}
