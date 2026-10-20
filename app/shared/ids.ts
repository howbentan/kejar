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
