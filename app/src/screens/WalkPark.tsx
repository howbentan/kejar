import { useEffect, useRef, useState } from 'react'
import { distanceM } from '../../shared/geo.js'
import type { LatLng } from '../../shared/types.js'
import type { View } from '../../shared/views.js'
import { call } from '../game/api'
import { loadOrganiserSession } from '../game/organiserSession'
import GameMap from '../game/Map'
import { ErrorText, Screen } from '../game/ui'
import { useGameState } from '../game/useGameState'

/** Within this distance of a spot, the card turns lime and the button appears. */
export const WALK_HERE_M = 15
/** No fix by now: say so instead of waiting. */
const NO_FIX_MS = 10_000

/** Who is walking: the organiser's token, or a marshal's player token. */
export type WalkCredentials = { organiserToken: string } | { token: string }

const POINTS = ['NORTH', 'NORTH-EAST', 'EAST', 'SOUTH-EAST', 'SOUTH', 'SOUTH-WEST', 'WEST', 'NORTH-WEST']

/** The compass point (of 8) from one spot towards another. */
function compass(from: LatLng, to: LatLng): string {
  const p1 = (from.lat * Math.PI) / 180
  const p2 = (to.lat * Math.PI) / 180
  const dl = ((to.lng - from.lng) * Math.PI) / 180
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  return POINTS[Math.round(deg / 45) % 8]
}

/** This phone's own position, followed like WalkGuide does. It never leaves the phone. */
function useHere(): { here: LatLng | null; lost: boolean } {
  const [here, setHere] = useState<LatLng | null>(null)
  const [lost, setLost] = useState(false)
  const hadFix = useRef(false)
  useEffect(() => {
    const geo = navigator.geolocation
    if (!geo) {
      setLost(true)
      return
    }
    const give = window.setTimeout(() => !hadFix.current && setLost(true), NO_FIX_MS)
    const id = geo.watchPosition(
      (p) => {
        window.clearTimeout(give)
        hadFix.current = true
        setLost(false)
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      // A passing error after a good fix isn't "lost".
      () => !hadFix.current && setLost(true),
      { enableHighAccuracy: true, maximumAge: 5_000 },
    )
    return () => {
      window.clearTimeout(give)
      geo.clearWatch(id)
    }
  }, [])
  return { here, lost }
}

const cardStyle = (kind: 'away' | 'here' | 'secret' | 'secret-here') => ({
  border: '1px solid var(--hair)',
  borderRadius: 18,
  padding: '14px 16px',
  ...(kind === 'here' ? { background: 'var(--volt)', color: 'var(--black)', borderColor: 'var(--volt)' } : {}),
  ...(kind === 'secret' ? { borderColor: 'var(--legendary-2)' } : {}),
  ...(kind === 'secret-here'
    ? { background: 'linear-gradient(135deg, var(--legendary-1), var(--legendary-2) 50%, var(--legendary-3))', color: 'var(--legendary-ink)', borderColor: 'var(--legendary-2)' }
    : {}),
})

/**
 * Walk the park (event day): one map, one card, the next thing to place. The list of spots comes from the view
 * (`kit.places`), which the server already trims for a marshal, so the secret step and its count are there only
 * when the server sent them. Position is worked out on this phone and never sent.
 */
export default function WalkPark({
  code,
  view,
  credentials,
  refresh,
  onBack,
}: {
  code: string
  view: View
  credentials: WalkCredentials
  refresh: () => void
  onBack: () => void
}) {
  const places = view.kit?.places ?? []
  const [local, setLocal] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { here, lost } = useHere()

  const done = (id: string) => local[id] === true || view.kit?.placed[id] === true
  const nextIndex = places.findIndex((p) => !done(p.id))
  const next = nextIndex === -1 ? null : places[nextIndex]
  const secret = next?.tone === 'yellow'
  const metres = here && next ? distanceM(here, next) : null
  // The secret step has no spot to reach: any place nearby will do, so only stations and Penjara use the 15 m rule.
  const isHere = !secret && metres !== null && metres <= WALK_HERE_M
  const letter = view.datoCard?.letter
  const hideLine = letter ? `Hide yellow card ${letter}.` : 'Hide the yellow card.'

  async function mark(id: string, beforeSave?: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await beforeSave?.()
      await call('setKit', { code, ...credentials, placed: { id, on: true } })
      setLocal((l) => ({ ...l, [id]: true }))
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const pins = places.map((p, i) => ({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    label: p.id === 'penjara' ? 'PENJARA' : p.tone === 'yellow' ? '?' : String(i + 1),
    state: (done(p.id) ? 'placed' : p.id === next?.id ? 'next' : 'todo') as 'placed' | 'next' | 'todo',
    ...(p.tone === 'yellow' ? { tone: 'yellow' as const } : {}),
  }))

  const eyebrow = secret ? 'WALK THE PARK · ONLY YOU SEE THIS' : 'WALK THE PARK'
  const count = `${nextIndex + 1} OF ${places.length}`
  const label = (id: string, name: string) => (id === 'penjara' ? 'Tape the Penjara card here.' : `Tape ${name} here.`)
  const upText = (id: string, name: string) => `${id === 'penjara' ? 'Penjara' : name} is up`

  return (
    <Screen eyebrow={eyebrow}>
      <GameMap
        arena={view.arena}
        dots={here ? [{ id: 'me', kind: 'me', lat: here.lat, lng: here.lng, at: new Date().toISOString(), revealedBy: null }] : []}
        pins={pins}
        route={here && next && !lost ? { from: here, to: next } : null}
        fit={[...places, ...(here ? [here] : [])].map((p) => ({ lat: p.lat, lng: p.lng }))}
        showJailAndStart={false}
        height={260}
      />

      {!next && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontWeight: 800, fontSize: 21, letterSpacing: '-0.04em' }}>Kit&apos;s out.</p>
        </div>
      )}

      {next && lost && !here && (
        <>
          <p className="muted">Turn on location to see where to go.</p>
          <div className="card">
            {places.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0' }}>
                <span style={p.tone === 'yellow' ? { color: 'var(--legendary-2)', fontWeight: 700 } : undefined}>
                  {p.tone === 'yellow' ? hideLine.slice(0, -1) : p.label}
                </span>
                {done(p.id) ? (
                  <span className="muted">Placed</span>
                ) : p.tone === 'yellow' ? (
                  <span className="muted">Needs location</span>
                ) : (
                  <button type="button" className="btn btn-ghost" style={{ padding: '6px 12px' }} disabled={busy} onClick={() => void mark(p.id)}>
                    {upText(p.id, p.label)}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {next && !(lost && !here) && (
        <>
          <div style={cardStyle(secret ? (here ? 'secret-here' : 'secret') : isHere ? 'here' : 'away')}>
            {secret ? (
              <>
                <p className="eyebrow" style={here ? { color: 'inherit', opacity: 0.6 } : { color: 'var(--legendary-2)' }}>{`SECRET · ${count}`}</p>
                <p style={{ fontWeight: 800, fontSize: 21, letterSpacing: '-0.04em' }}>{hideLine}</p>
                <p>Secret. Only you see this. Pick any spot nearby.</p>
                <p>Hide it somewhere sneaky. Under a bench, behind a sign.</p>
              </>
            ) : isHere ? (
              <>
                <p className="eyebrow" style={{ color: 'inherit', opacity: 0.6 }}>{`YOU'RE HERE · ${Math.round(metres!)} M`}</p>
                <p style={{ fontWeight: 800, fontSize: 21, letterSpacing: '-0.04em' }}>{label(next.id, next.label)}</p>
                <p>At eye level, facing the path.</p>
              </>
            ) : (
              <>
                <p className="eyebrow">{`NEXT · ${count}`}</p>
                <p style={{ fontWeight: 800, fontSize: 21, letterSpacing: '-0.04em' }}>{next.label}</p>
                <p className="mono">{metres === null ? 'Finding you…' : `${Math.round(metres / 10) * 10} M · ${compass(here!, next)}`}</p>
              </>
            )}
          </div>
          {isHere && !secret && (
            <button type="button" className="btn" disabled={busy} onClick={() => void mark(next.id)}>
              {upText(next.id, next.label)}
            </button>
          )}
          {secret && here && !lost && (
            <button
              type="button"
              className="btn btn-legendary"
              disabled={busy}
              onClick={() => void mark('dato', () => call('dropDatoSeri', { code, ...credentials, lat: here!.lat, lng: here!.lng }))}
            >
              Drop Dato Seri here
            </button>
          )}
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <button type="button" className="btn btn-ghost" style={{ marginTop: 'auto' }} onClick={onBack}>
        Back to the lobby
      </button>
    </Screen>
  )
}

/** The organiser's page at /host/<CODE>/walk: loads the game and walks with the organiser token. */
export function HostWalk({ code }: { code: string }) {
  const organiser = loadOrganiserSession(localStorage)
  const { view, error, refresh } = useGameState(code, { sendLocation: 'never' })
  if (!organiser) {
    return (
      <Screen eyebrow="WALK THE PARK">
        <p className="muted">This phone didn&apos;t create game {code}, so it can&apos;t walk it.</p>
      </Screen>
    )
  }
  if (!view) {
    return (
      <Screen eyebrow="WALK THE PARK">
        <ErrorText>{error ?? ''}</ErrorText>
      </Screen>
    )
  }
  return (
    <WalkPark
      code={code}
      view={view}
      credentials={{ organiserToken: organiser.organiserToken }}
      refresh={refresh}
      onBack={() => window.location.assign(`/host/${code}`)}
    />
  )
}
