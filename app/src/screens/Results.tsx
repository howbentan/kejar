import type { View } from '../../shared/views.js'
import { ENDGAME_COPY } from '../game/EndgameLogo'
import { clock } from '../game/time'
import { Screen, Wordmark } from '../game/ui'
import PostGameFeedback from './PostGameFeedback'

/** The endgame the game had, in its colour (endgame design §6.4); for Hang Hebat, whether the bounty was caught. */
function EndgameLine({ view }: { view: View }) {
  const e = view.endgame
  if (!e) return null
  const copy = ENDGAME_COPY[e.kind]
  const text = e.kind === 'hebat' ? `Endgame: Hang Hebat. The bounty ${e.bountyCaught ? 'was caught' : 'got away'}.` : `Endgame: ${copy.name}.`
  return <p style={{ color: copy.colour, fontWeight: 700 }}>{text}</p>
}

/** "Game over", who won, and the awards card. Shared with MarshalLive, where marshals and the organiser see it post-game. */
export function ResultsSummary({ view }: { view: View }) {
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
    <>
      <p className="eyebrow">Game over</p>
      <h1 style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-0.05em', lineHeight: 1 }}>
        {r?.winner === 'chasers' ? 'Kejar win.' : 'Dikejar escaped.'}
      </h1>
      {r && r.winner === 'runners' && (
        <p className="muted">
          {r.survivors.length} Dikejar still free at the whistle.
        </p>
      )}
      <EndgameLine view={view} />
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
    </>
  )
}

/** The organiser's way into the next game. */
export function PlayAgain() {
  return (
    <a className="btn" href="/host/new" style={{ textAlign: 'center', textDecoration: 'none' }}>
      Play again
    </a>
  )
}

export default function Results({ code, view, isHost }: { code: string; view: View; isHost: boolean }) {
  return (
    <Screen>
      <Wordmark size={28} />
      <ResultsSummary view={view} />
      <PostGameFeedback code={code} view={view} />
      {isHost && <PlayAgain />}
    </Screen>
  )
}
