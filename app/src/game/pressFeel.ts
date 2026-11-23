import { playPress } from './sounds'

/**
 * Makes every main button feel pressed: a tiny buzz (Android) and a soft tock as the thumb goes down. The squash
 * itself is CSS (.btn:active). Second choices (.btn-ghost) and disabled buttons stay quiet.
 */
export function installPressFeel(doc: Document = document): () => void {
  const onDown = (e: PointerEvent) => {
    const el = (e.target as Element | null)?.closest?.('.btn')
    if (!el || el.classList.contains('btn-ghost') || (el as HTMLButtonElement).disabled) return
    navigator.vibrate?.(8)
    playPress()
  }
  doc.addEventListener('pointerdown', onDown, { capture: true, passive: true })
  return () => doc.removeEventListener('pointerdown', onDown, { capture: true })
}
