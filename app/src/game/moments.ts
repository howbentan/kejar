/** A moment plays only this soon after the thing happened, so reopening Kejar later doesn't replay it. */
export const MOMENT_WINDOW_MS = 15_000

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
