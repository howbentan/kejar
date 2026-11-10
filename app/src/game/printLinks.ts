/**
 * The print page's # part: `#bomoh/<code>` for a purple card, `#dato/<code>` or a bare `#<code>` for the ★ card. The
 * bare form is what every link made before Bomoh used, so it keeps meaning Dato Seri. Codes never contain a `/`.
 */
export function parsePrintCardHash(hash: string): { legendary: 'dato' | 'bomoh'; code: string } {
  const raw = decodeURIComponent(hash.replace(/^#/, ''))
  const m = /^(dato|bomoh)\/(.*)$/.exec(raw)
  return m ? { legendary: m[1] as 'dato' | 'bomoh', code: m[2] } : { legendary: 'dato', code: raw }
}

/** The print page link for one card. The code goes after #, so it never reaches the server or its logs. */
export const printCardUrl = (legendary: 'dato' | 'bomoh', code: string) =>
  legendary === 'bomoh' ? `/print/card#bomoh/${encodeURIComponent(code)}` : `/print/card#${encodeURIComponent(code)}`
