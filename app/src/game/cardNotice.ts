import type { View } from '../../shared/views.js'

export type Legendary = 'dato' | 'bomoh'
const LEGENDARIES: Legendary[] = ['dato', 'bomoh']

/** The server's no-free-card notice for each legendary (NO_FREE_NOTICE in actions.ts), word for word. */
export const REPRINT_LINE: Record<Legendary, string> = {
  dato: 'Reprint a yellow card to use Dato Seri.',
  bomoh: 'Reprint a purple card to use Bomoh.',
}

/**
 * The setup steps' `notice` URL param for create's notice: which legendaries had no free card, as `dato`, `bomoh` or
 * `dato,bomoh`, or '' for none. A notice that names neither is taken as Dato Seri's, as it was before Bomoh.
 */
export function noticeParam(notice: string | undefined): string {
  if (!notice) return ''
  const named = LEGENDARIES.filter((l) => notice.includes(REPRINT_LINE[l]))
  return (named.length ? named : ['dato']).join(',')
}

/** The legendaries a `notice` URL param names, ignoring anything else in it. */
export function noticeLegendaries(search: string): Legendary[] {
  const raw = new URLSearchParams(search).get('notice')?.split(',') ?? []
  return LEGENDARIES.filter((l) => raw.includes(l))
}

/**
 * Full, wanting this legendary's card, but none was free yet: the lobby keeps trying (ruling R9). `legendaries` and
 * the cards are in the organiser's own view only, so this is false for everyone else.
 */
export function waitingForCard(view: View, legendary: Legendary): boolean {
  const card = legendary === 'bomoh' ? view.bomohCard : view.datoCard
  return view.settings?.mode === 'full' && view.settings.legendaries?.[legendary] === 'stash' && card === null
}
