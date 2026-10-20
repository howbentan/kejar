import type { Platform } from './types'

const KEY = 'kejar.deviceId'

export function getDeviceId(storage: Storage): string {
  const existing = storage.getItem(KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  storage.setItem(KEY, id)
  return id
}

export function platformOf(ua: string): Platform {
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}
