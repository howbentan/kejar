import { DEFAULT_SETTINGS, type Game, type Settings } from './types.js'

/** One line on the organiser's packing list or event-day list. */
export interface KitItem {
  id: string
  group: 'pack' | 'day'
  label: string
  tone?: 'yellow' | 'purple'
  note?: string
}

/** A spot to walk to and tape a card at. `dato` is the organiser's own secret one. */
export interface PlaceItem {
  id: string
  label: string
  lat: number
  lng: number
  tone?: 'yellow' | 'purple'
}

/** The card letters of the secret sets the app assigned to this game. Passed only into the organiser's views. */
export interface SecretLetters {
  dato?: string
  bomoh?: string
}

export type PlayersBand = 20 | 30 | 40

/** Ids only the organiser may tick or place (spec: Dato Seri secrecy). */
export const SECRET_PACK_IDS = ['dato-card', 'bomoh-card']
export const SECRET_PLACE_IDS = ['dato', 'bomoh']

/** Older games stored before the setup settings existed have no band or legendaries: read them with the defaults. */
const bandOf = (game: Game): PlayersBand => game.settings.playersBand ?? DEFAULT_SETTINGS.playersBand
const legendariesOf = (game: Game): Settings['legendaries'] => ({ ...DEFAULT_SETTINGS.legendaries, ...game.settings.legendaries })

/** The saved ticks and placed flags; a game with no kit yet (or the column's empty default) has none. */
export function kitOf(game: Game): { ticks: Record<string, string>; placed: Record<string, boolean> } {
  return { ticks: game.kit?.ticks ?? {}, placed: game.kit?.placed ?? {} }
}

/** Marshals to bring: you plus a helper up to 20 players, then about one more per 10. */
export function crewFor(band: PlayersBand): number {
  return band === 20 ? 2 : band === 30 ? 3 : 4
}

/** The pack list then the event-day list, in order. The yellow card is only listed when its letter is passed in. */
export function packItems(game: Game, secretLetters: SecretLetters): KitItem[] {
  const band = bandOf(game)
  const stations = game.arena.stations?.length ?? 0
  const items: KitItem[] = [
    { id: 'armbands', group: 'pack', label: 'Armbands #01–#40' },
    { id: 'vests-kejar', group: 'pack', label: `${Math.ceil(band / 5)} lime vests` },
    { id: 'vests-marshal', group: 'pack', label: `${crewFor(band)} marshal vests` },
  ]
  if (stations > 0) items.push({ id: 'stations', group: 'pack', label: stations === 1 ? 'Station card 1' : `Station cards 1–${stations}` })
  items.push({ id: 'penjara', group: 'pack', label: 'Penjara card' })
  if (game.settings.mode === 'full' && legendariesOf(game).dato === 'stash' && secretLetters.dato) {
    items.push({ id: 'dato-card', group: 'pack', label: `Yellow card ${secretLetters.dato}`, tone: 'yellow', note: '(secret)' })
  }
  if (game.settings.mode === 'full' && legendariesOf(game).bomoh === 'stash' && secretLetters.bomoh) {
    items.push({ id: 'bomoh-card', group: 'pack', label: `Purple card ${secretLetters.bomoh}`, tone: 'purple', note: '(secret)' })
  }
  items.push(
    { id: 'tape', group: 'pack', label: 'Tape, zip bags, power bank' },
    { id: 'walk', group: 'day', label: 'Walk the park' },
    { id: 'brief-helper', group: 'day', label: 'Brief your helper', note: 'Penjara, dares, SOS' },
    { id: 'brief-players', group: 'day', label: 'Brief the players' },
  )
  return items
}

/** Where the cards go: stations 1..N, Penjara, then (organiser only) Dato Seri's and Bomoh's stashes. */
export function placeItems(game: Game, forOrganiser: boolean, secretLetters: SecretLetters): PlaceItem[] {
  const places: PlaceItem[] = (game.arena.stations ?? []).map((s, i) => ({
    id: `station-${i + 1}`,
    label: `Station ${i + 1}`,
    lat: s.lat,
    lng: s.lng,
  }))
  places.push({ id: 'penjara', label: 'Penjara', lat: game.arena.jail.lat, lng: game.arena.jail.lng })
  const stash = game.dato_stash
  if (
    forOrganiser &&
    game.settings.mode === 'full' &&
    legendariesOf(game).dato === 'stash' &&
    secretLetters.dato &&
    !stash?.claimedBy
  ) {
    const at = typeof stash?.lat === 'number' && typeof stash?.lng === 'number' ? { lat: stash.lat, lng: stash.lng } : game.arena.start
    places.push({ id: 'dato', label: 'Yellow card', lat: at.lat, lng: at.lng, tone: 'yellow' })
  }
  const bomoh = game.bomoh_stash
  if (
    forOrganiser &&
    game.settings.mode === 'full' &&
    legendariesOf(game).bomoh === 'stash' &&
    secretLetters.bomoh &&
    !bomoh?.claimedBy
  ) {
    const at = typeof bomoh?.lat === 'number' && typeof bomoh?.lng === 'number' ? { lat: bomoh.lat, lng: bomoh.lng } : game.arena.start
    places.push({ id: 'bomoh', label: 'Purple card', lat: at.lat, lng: at.lng, tone: 'purple' })
  }
  return places
}

/**
 * Ticked while the item's label is still the one it was ticked under (a new band or a different secret card
 * un-ticks it). "Walk the park" ticks itself once every non-secret place is placed.
 */
export function isTicked(game: Game, item: KitItem): boolean {
  const kit = kitOf(game)
  if (item.id === 'walk') {
    const shared = placeItems(game, false, {})
    if (shared.length > 0 && shared.every((p) => kit.placed[p.id] === true)) return true
  }
  return kit.ticks[item.id] === item.label
}
