/** The logo's letters, each a full 900 x 543 frame with the letter in place (the j is drawn separately). */
export const LETTERS = ['k', 'e', 'a', 'r'] as const
export type Letter = (typeof LETTERS)[number]

export const letterSrc = (l: Letter) => `/home/letter-${l}.png`

let loading: Promise<void> | null = null

/**
 * Resolves once every letter image has loaded (or failed), but never later than `capMs`, so the opening
 * never shows a half-drawn logo on a first visit and never waits long on a slow connection.
 */
export function lettersReady(capMs = 1200): Promise<void> {
  if (!loading && typeof Image !== 'undefined') {
    loading = Promise.all(
      LETTERS.map(
        (l) =>
          new Promise<void>((resolve) => {
            const img = new Image()
            img.onload = img.onerror = () => resolve()
            img.src = letterSrc(l)
          }),
      ),
    ).then(() => undefined)
  }
  const cap = new Promise<void>((resolve) => setTimeout(resolve, capMs))
  return loading ? Promise.race([loading, cap]) : cap
}
