import { LEGENDARY_KINDS } from '../../shared/legendaries.js'
import type { LegendaryKind } from '../../shared/types.js'
import type { View } from '../../shared/views.js'

export type Legendary = LegendaryKind
const LEGENDARIES: readonly Legendary[] = LEGENDARY_KINDS

/** The server's no-free-card notice for each legendary (NO_FREE_NOTICE in actions.ts), word for word. */
export const REPRINT_LINE: Record<Legendary, string> = {
  dato: 'Reprint a yellow card to use Dato Seri.',
  ring: 'Reprint an orange card to use Super Ring.',
  bomoh: 'Reprint a purple card to use Bomoh.',
  hijau: 'Reprint a green card to use Mak Kau Hijau.',
}

/** The organiser's card for one legendary in a view: undefined outside the organiser's own view, null with none. */
export function cardIn(view: View, legendary: Legendary): View['datoCard'] {
  return { dato: view.datoCard, ring: view.ringCard, bomoh: view.bomohCard, hijau: view.hijauCard }[legendary]
}

/** The organiser's dropped stash for one legendary in a view, with the same undefined/null meaning as `cardIn`. */
export function stashIn(view: View, legendary: Legendary): View['datoStash'] {
  return { dato: view.datoStash, ring: view.ringStash, bomoh: view.bomohStash, hijau: view.hijauStash }[legendary]
}

/**
 * The setup steps' `notice` URL param for create's notice: which legendaries had no free card, as `dato`, `bomoh` or
 * `dato,bomoh` (and so on), or '' for none. A notice that names none is taken as Dato Seri's, as it was before Bomoh.
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
  return view.settings?.mode === 'full' && view.settings.legendaries?.[legendary] === 'stash' && cardIn(view, legendary) === null
}
