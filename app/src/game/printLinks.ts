import type { LegendaryKind } from '../../shared/types.js'

/**
 * The print page's # part: `#bomoh/<code>`, `#ring/<code>` or `#hijau/<code>` for those cards, `#dato/<code>` or a
 * bare `#<code>` for the ★ card. The bare form is what every link made before Bomoh used, so it keeps meaning Dato
 * Seri. Codes never contain a `/`.
 */
export function parsePrintCardHash(hash: string): { legendary: LegendaryKind; code: string } {
  const raw = decodeURIComponent(hash.replace(/^#/, ''))
  const m = /^(dato|bomoh|ring|hijau)\/(.*)$/.exec(raw)
  return m ? { legendary: m[1] as LegendaryKind, code: m[2] } : { legendary: 'dato', code: raw }
}

/** The print page link for one card. The code goes after #, so it never reaches the server or its logs. */
export const printCardUrl = (legendary: LegendaryKind, code: string) =>
  legendary === 'dato' ? `/print/card#${encodeURIComponent(code)}` : `/print/card#${legendary}/${encodeURIComponent(code)}`
