import { SIDE_PAIRS } from './legendaries.js'
import { legendaryOn, mirroredSpots } from './tupperware.js'
import { DEFAULT_SETTINGS, placedStash, type Game, type LegendaryKind, type TupperSide } from './types.js'

/** The Tupperware's colour: the red box everyone's mak has, the same for both sides. */
export type TupperTone = 'red'

/** A secret line's or step's colour: the box's red, the only one since the colour cards were retired. */
export type SecretTone = TupperTone

/** One line on the organiser's packing list or event-day list. */
export interface KitItem {
  id: string
  group: 'pack' | 'day'
  label: string
  tone?: SecretTone
  note?: string
}

/** A spot to walk to and tape a card at. `tupper-dikejar` and `tupper-kejar` are the organiser's own secret ones. */
export interface PlaceItem {
  id: string
  label: string
  lat: number
  lng: number
  tone?: SecretTone
}

export type PlayersBand = 20 | 30 | 40

/** Ids only the organiser may tick or place: the Tupperwares are secret from marshals and players (spec). */
export const SECRET_PACK_IDS: string[] = ['tupperware', 'bring-home']
export const SECRET_PLACE_IDS: string[] = ['tupper-dikejar', 'tupper-kejar']

/** The walk step that places this legendary's Tupperware: Dikejar's pair share one, Kejar's the other. */
export const placeIdFor = (legendary: LegendaryKind): string => `tupper-${(SIDE_PAIRS.runner as readonly string[]).includes(legendary) ? 'dikejar' : 'kejar'}`

const SIDES: TupperSide[] = ['dikejar', 'kejar']
const capital = (s: string) => s[0].toUpperCase() + s.slice(1)
const stashOf = (game: Game, kind: LegendaryKind) =>
  ({ dato: game.dato_stash, ring: game.ring_stash, bomoh: game.bomoh_stash, hijau: game.hijau_stash })[kind]

/** The sides whose Tupperware is in play: Full mode, and a legendary on a hidden stash for that side. */
const sidesOn = (game: Game): TupperSide[] => SIDES.filter((side) => legendaryOn(game, side) !== null)

/** Older games stored before the setup settings existed have no band or legendaries: read them with the defaults. */
const bandOf = (game: Game): PlayersBand => game.settings.playersBand ?? DEFAULT_SETTINGS.playersBand

/** The saved ticks and placed flags; a game with no kit yet (or the column's empty default) has none. */
export function kitOf(game: Game): { ticks: Record<string, string>; placed: Record<string, boolean> } {
  return { ticks: game.kit?.ticks ?? {}, placed: game.kit?.placed ?? {} }
}

/** Marshals to bring: you plus a helper up to 20 players, then about one more per 10. */
export function crewFor(band: PlayersBand): number {
  return band === 20 ? 2 : band === 30 ? 3 : 4
}

/** The pack list then the event-day list, in order. The Tupperware lines are there only while a side is on. */
export function packItems(game: Game): KitItem[] {
  const band = bandOf(game)
  const stations = game.arena.stations?.length ?? 0
  const items: KitItem[] = [
    { id: 'armbands', group: 'pack', label: 'Armbands #01–#40' },
    { id: 'vests-kejar', group: 'pack', label: `${Math.ceil(band / 5)} lime vests` },
    { id: 'vests-marshal', group: 'pack', label: `${crewFor(band)} marshal vests` },
  ]
  if (stations > 0) items.push({ id: 'stations', group: 'pack', label: stations === 1 ? 'Station card 1' : `Station cards 1–${stations}` })
  items.push({ id: 'penjara', group: 'pack', label: 'Penjara card' })
  const on = sidesOn(game)
  if (on.length > 0) {
    const label = on.length === 2 ? '2 red Tupperwares, 1 slip of each side' : `1 red Tupperware, 1 ${capital(on[0])} slip`
    items.push({ id: 'tupperware', group: 'pack', label })
  }
  items.push(
    { id: 'tape', group: 'pack', label: 'Tape, zip bags, power bank' },
    { id: 'walk', group: 'day', label: 'Walk the park' },
    { id: 'brief-helper', group: 'day', label: 'Brief your helper', note: 'Penjara, dares, SOS' },
    { id: 'brief-players', group: 'day', label: 'Brief the players' },
  )
  if (on.length > 0) items.push({ id: 'bring-home', group: 'day', label: 'Bawa balik Tupperware Mak!' })
  return items
}

/**
 * Where the cards go: stations 1..N, Penjara, then (organiser only) a step for each Tupperware still in play: at
 * the dropped spot, or the suggested one until it's dropped. A marshal's list never has a secret step, so it never
 * counts one in its OF N.
 */
export function placeItems(game: Game, forOrganiser: boolean): PlaceItem[] {
  const places: PlaceItem[] = (game.arena.stations ?? []).map((s, i) => ({
    id: `station-${i + 1}`,
    label: `Station ${i + 1}`,
    lat: s.lat,
    lng: s.lng,
  }))
  places.push({ id: 'penjara', label: 'Penjara', lat: game.arena.jail.lat, lng: game.arena.jail.lng })
  if (!forOrganiser || game.settings.mode !== 'full') return places
  const suggested = mirroredSpots(game.arena, game.id)
  for (const side of sidesOn(game)) {
    const stash = stashOf(game, legendaryOn(game, side)!)
    if (stash?.claimedBy) continue
    const at = placedStash(stash) ?? suggested[side]
    places.push({ id: `tupper-${side}`, label: `${capital(side)} Tupperware`, lat: at.lat, lng: at.lng, tone: 'red' })
  }
  return places
}

/**
 * Ticked while the item's label is still the one it was ticked under (a new band or a different Tupperware
 * line un-ticks it). "Walk the park" ticks itself once every non-secret place is placed, and "Brief the players" once
 * the organiser has tapped the Brief the players button (`briefed_at`), never from an old manual tick.
 */
export function isTicked(game: Game, item: KitItem): boolean {
  if (item.id === 'brief-players') return Boolean(game.briefed_at)
  const kit = kitOf(game)
  if (item.id === 'walk') {
    const shared = placeItems(game, false)
    if (shared.length > 0 && shared.every((p) => kit.placed[p.id] === true)) return true
  }
  return kit.ticks[item.id] === item.label
}
