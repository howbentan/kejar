export type Platform = 'ios' | 'android' | 'other'

export interface Device {
  id: string
  label: string
  platform: Platform
  subscription: PushSubscriptionJSON
  active: boolean
  created_at: string
}

export interface Ping {
  id: string
  sent_at: string
  sent_count: number
  /** Devices this ping was sent to (all active devices at send time). */
  target_ids: string[]
}

export interface Ack {
  ping_id: string
  device_id: string
  received_at: string
}

export interface Checkin {
  ping_id: string
  device_id: string
  created_at: string
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  error: string | null
}
