import { chaseStartOf, phaseAt } from './clock.js'
import type { Game, GameEvent, Player, Results } from './types.js'

export function computeResults(game: Game, players: Player[], events: GameEvent[]): Results {
  const runners = players.filter((p) => p.role === 'runner')
  const survivors = runners.filter((p) => !p.jailed).map((p) => p.id)
  const chaseStart = chaseStartOf(game) ?? 0
  const end = phaseAt(game, Number.MAX_SAFE_INTEGER).endsAt ?? chaseStart
  const caught = events.filter((e) => e.type === 'caught').sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  // Survival runs until a runner's first catch (or the end of the game).
  let longestSurvivor: Results['longestSurvivor'] = null
  for (const r of runners) {
    const first = caught.find((e) => e.target_id === r.id)
    const ms = (first ? Date.parse(first.at) : end) - chaseStart
    if (!longestSurvivor || ms > longestSurvivor.ms) longestSurvivor = { id: r.id, ms }
  }

  // Only players still in the game win awards (removed players are left out of `players`).
  const inGame = new Set(players.map((p) => p.id))
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
