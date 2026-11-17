const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** 6 characters without look-alikes (no I, L, O, 0, 1). */
export function newGameCode(rng: () => number): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]).join('')
}

export function tagQr(tagId: number): string {
  return `KEJAR:TAG:${String(tagId).padStart(2, '0')}`
}

export function tagIdFromQr(text: string): number | null {
  const m = /^KEJAR:TAG:(\d{2})$/.exec(text.trim())
  if (!m) return null
  const id = Number(m[1])
  return id >= 1 && id <= 99 ? id : null
}

export const JAIL_QR = 'KEJAR:JAIL'

/** The printed single-use Tupperware slip: `KEJAR:SLIP:<token>`. The token is a long random string; the side is on the paper, not in the code. */
export const slipQr = (token: string) => `KEJAR:SLIP:${token}`

/** Any slip, this organisation's or not, including a bare `KEJAR:SLIP`: all go to the server as a scan. */
export const isSlipQr = (text: string) => /^KEJAR:SLIP(:|$)/.test(text.trim())

/** The token on a slip, or null for a bare or malformed one. */
export function slipTokenFromQr(text: string): string | null {
  const m = /^KEJAR:SLIP:([A-Za-z0-9_-]{1,64})$/.exec(text.trim())
  return m ? m[1] : null
}

export const MAX_STATIONS = 8
/** Most players one game takes; the lobby refuses more. Armbands #01 to this are always printed. */
export const MAX_PLAYERS_PER_GAME = 40

export function stationQr(n: number): string {
  return `KEJAR:STATION:${n}`
}

export function stationFromQr(text: string): number | null {
  const m = /^KEJAR:STATION:(\d)$/.exec(text.trim())
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= MAX_STATIONS ? n : null
}
