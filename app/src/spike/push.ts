import { platformOf } from './device'

export type PushSupport = 'ok' | 'needs-install' | 'unsupported' | 'denied'

export interface PushEnv {
  ua: string
  standalone: boolean
  hasPushManager: boolean
  permission: NotificationPermission
}

export function pushSupport(env: PushEnv): PushSupport {
  if (env.permission === 'denied') return 'denied'
  if (platformOf(env.ua) === 'ios' && !env.standalone) return 'needs-install'
  if (!env.hasPushManager) return 'unsupported'
  return 'ok'
}

export function currentPushEnv(): PushEnv {
  const nav = navigator as Navigator & { standalone?: boolean }
  return {
    ua: navigator.userAgent,
    standalone: nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches,
    hasPushManager: 'serviceWorker' in navigator && 'PushManager' in window,
    permission: 'Notification' in window ? Notification.permission : 'default',
  }
}

export function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function subscribe(vapidPublicKey: string): Promise<PushSubscriptionJSON> {
  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(`Notifications ${permission}`)
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  })
  return subscription.toJSON()
}
