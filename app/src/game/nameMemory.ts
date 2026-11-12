/** The name a player used last time, so the join form can fill it in (home upgrades design). */
const KEY = 'kejar.name'

export function loadName(storage: Storage): string {
  try {
    return (storage.getItem(KEY) ?? '').trim()
  } catch {
    return ''
  }
}

export function saveName(storage: Storage, name: string): void {
  try {
    const n = name.trim()
    if (n) storage.setItem(KEY, n)
  } catch {
    // Blocked storage: the form just starts empty next time.
  }
}

export function forgetName(storage: Storage): void {
  try {
    storage.removeItem(KEY)
  } catch {
    // Nothing to forget.
  }
}
