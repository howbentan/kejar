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
 * The printed Dato Seri card the organiser hides (jail design §4b); scanning it is a claim. The code belongs to one of
 * the organisation's reusable yellow cards (A-C), assigned to a game and claiming only there while it's in play
 * (ruling R15). It's printed from the organiser-only link, never the public sheet, and reprinting gives a new code.
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

/**
 * The printed Bomoh card (the chaser-side legendary power-up); the same card rules as the ★ card above. Scanning it is
 * a claim, and the code belongs to one of the organisation's reusable cards, claiming only in its own game (ruling R15).
 */
export const bomohQr = (code: string) => `KEJAR:BOMOH:${code}`

/**
 * Any Bomoh card, this game's or not, including a bare `KEJAR:BOMOH`: all go to the server as a claim, which answers
 * a wrong card exactly like no stash, so a scan never says whose card it was.
 */
export const isBomohQr = (text: string) => /^KEJAR:BOMOH(:|$)/.test(text.trim())

/** The secret code on a Bomoh card, or null for a bare or malformed one. */
export function bomohCodeFromQr(text: string): string | null {
  const m = /^KEJAR:BOMOH:([A-Za-z0-9_-]{1,64})$/.exec(text.trim())
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
