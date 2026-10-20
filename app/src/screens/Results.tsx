import type { View } from '../../shared/views.js'
import { clock } from '../game/time'
import { Screen, Wordmark } from '../game/ui'

export default function Results({ view, isHost }: { view: View; isHost: boolean }) {
  const r = view.results
  const name = (id: string) => view.roster.find((p) => p.id === id)?.name ?? 'Someone'
  const awards = r
    ? [
        r.longestSurvivor && { label: 'Longest survivor', value: `${name(r.longestSurvivor.id)} · ${clock(r.longestSurvivor.ms)}` },
        r.mostCatches && { label: 'Most catches', value: `${name(r.mostCatches.id)} · ${r.mostCatches.count}` },
        r.jailbreakHero && { label: 'Jailbreak hero', value: `${name(r.jailbreakHero.id)} · ${r.jailbreakHero.freed} freed` },
      ].filter((a): a is { label: string; value: string } => !!a)
    : []

  return (
    <Screen>
      <Wordmark size={28} />
      <p className="eyebrow">Game over</p>
      <h1 style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-0.05em', lineHeight: 1 }}>
        {r?.winner === 'chasers' ? 'Chasers win.' : 'Runners escaped.'}
      </h1>
      {r && r.winner === 'runners' && (
        <p className="muted">
          {r.survivors.length} runner{r.survivors.length === 1 ? '' : 's'} still free at the whistle.
        </p>
      )}
      {awards.length > 0 && (
        <div className="card">
          {awards.map((a) => (
            <div key={a.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span className="muted">{a.label}</span>
              <span style={{ fontWeight: 600 }}>{a.value}</span>
            </div>
          ))}
        </div>
      )}
      {isHost && (
        <a className="btn" href="/host/new" style={{ textAlign: 'center', textDecoration: 'none' }}>
          Play again
        </a>
      )}
    </Screen>
  )
}
