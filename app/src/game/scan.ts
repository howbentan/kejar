import { isDatoQr, JAIL_QR, stationFromQr, tagIdFromQr } from '../../shared/ids.js'

export type ScanTarget =
  | { action: 'claim'; body: { qr: string } }
  | { action: 'jailbreak'; body: { qr: string } }
  | { action: 'catch'; body: { tagQr: string } }
  | { error: string }

/** The one Scan button: what a scanned code means for this side. Anything else calls nothing. */
export function scanTarget(text: string, role: 'runner' | 'chaser'): ScanTarget {
  // The hidden stash scans like a station; the server turns away anyone but a free runner.
  if (stationFromQr(text) !== null || isDatoQr(text)) return { action: 'claim', body: { qr: text } }
  if (role === 'runner') {
    if (text.trim() === JAIL_QR) return { action: 'jailbreak', body: { qr: text } }
    return { error: "That's not a station or Penjara code" }
  }
  if (tagIdFromQr(text) !== null) return { action: 'catch', body: { tagQr: text } }
  return { error: "That's not a tag or station code" }
}
