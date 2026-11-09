import { chaseStartOf, phaseAt } from './clock.js'
import { isOut } from './players.js'
import type { Game, GameEvent, Player, Results } from './types.js'

export function computeResults(game: Game, players: Player[], events: GameEvent[]): Results {
  const runners = players.filter((p) => p.role === 'runner')
  const survivors = runners.filter((p) => !isOut(p)).map((p) => p.id)
  const chaseStart = chaseStartOf(game) ?? 0
  const end = phaseAt(game, Number.MAX_SAFE_INTEGER).endsAt ?? chaseStart
  const caught = events.filter((e) => e.type === 'caught').sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  // Survival runs until a runner's first catch or auto-jail (or the end of the game).
  // A Luar Garisan runner's survival also ends there, but they are left out of the award below, so no event is needed.
  // An auto-jail a marshal undid (a phone fault) doesn't end survival (motion design §5b).
  const undone = (e: GameEvent) => events.some((u) => u.type === 'auto-jail-undone' && u.data.eventId === e.id)
  const jailings = events
    .filter((e) => e.type === 'caught' || (e.type === 'auto-jailed' && !undone(e)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  let longestSurvivor: Results['longestSurvivor'] = null
  // Disqualified players win nothing, so they are out of every award (the catches they made earlier included).
  const eligible = (p: Player) => !p.disqualified_at
  for (const r of runners.filter(eligible)) {
    const first = jailings.find((e) => e.target_id === r.id)
    const ms = (first ? Date.parse(first.at) : end) - chaseStart
    if (!longestSurvivor || ms > longestSurvivor.ms) longestSurvivor = { id: r.id, ms }
  }

  // Only players still in the game win awards (removed players are left out of `players`).
  const inGame = new Set(players.filter(eligible).map((p) => p.id))
  const tally = (list: GameEvent[], amount: (e: GameEvent) => number) => {
    const totals = new Map<string, number>()
    for (const e of list) if (e.actor_id && inGame.has(e.actor_id)) totals.set(e.actor_id, (totals.get(e.actor_id) ?? 0) + amount(e))
    let best: { id: string; n: number } | null = null
    for (const [id, n] of totals) if (!best || n > best.n) best = { id, n }
    return best
  }
  const catches = tally(caught, () => 1)
  const breaks = tally(
    events.filter((e) => e.type === 'jailbreak'),
    (e) => Number(e.data.freed ?? 0),
  )

  return {
    winner: survivors.length > 0 ? 'runners' : 'chasers',
    survivors,
    longestSurvivor,
    mostCatches: catches ? { id: catches.id, count: catches.n } : null,
    jailbreakHero: breaks ? { id: breaks.id, freed: breaks.n } : null,
  }
}
