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

/**
 * The printed Dato Seri card the organiser hides (jail design §4b); scanning it is a claim. Each game's card
 * carries that game's own secret code (ruling R15), so it's printed from the organiser tools, never the public sheet.
 */
export const datoQr = (code: string) => `KEJAR:DATO:${code}`

/**
 * Any ★ card, this game's or not, including a bare `KEJAR:DATO`: all go to the server as a claim, which answers
 * a wrong card exactly like no stash, so a scan never says whose card it was.
 */
export const isDatoQr = (text: string) => /^KEJAR:DATO(:|$)/.test(text.trim())

/** The secret code on a ★ card, or null for a bare or malformed one. */
export function datoCodeFromQr(text: string): string | null {
  const m = /^KEJAR:DATO:([A-Za-z0-9_-]{1,64})$/.exec(text.trim())
  return m ? m[1] : null
}

export const MAX_STATIONS = 8

export function stationQr(n: number): string {
  return `KEJAR:STATION:${n}`
}

export function stationFromQr(text: string): number | null {
  const m = /^KEJAR:STATION:(\d)$/.exec(text.trim())
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= MAX_STATIONS ? n : null
}
