export type Platform = 'ios' | 'android' | 'other'

export function platformOf(ua: string): Platform {
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}
