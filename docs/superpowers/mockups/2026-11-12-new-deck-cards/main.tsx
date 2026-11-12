// Mockup of Plan E1's new cards, rendered with the real app components and sample data.
// Dev only: open /mockups/e1/index.html on the Vite dev server. Not part of the app build.
import { createRoot } from 'react-dom/client'
import { MotionRoot } from '../../src/game/motion'
import '../../src/styles/tokens.css'
import Sticker from '../../src/game/Sticker'
import PowerCard from '../../src/game/PowerCard'
import PowerUpHand from '../../src/game/PowerUpHand'
import FreezePicker from '../../src/game/FreezePicker'
import { testView } from '../../src/screens/testView'
import type { PowerUp, PowerUpKind } from '../../shared/types'
import type { MapDot, View } from '../../shared/views'

const NOW = Date.now()
const iso = (t: number) => new Date(t).toISOString()
// Taman Tasik Titiwangsa-ish, so the map has something real under it.
const C = { lat: 3.1786, lng: 101.7066 }
const off = (dN: number, dE: number) => ({ lat: C.lat + dN / 111_195, lng: C.lng + dE / 111_195 })
const ring = Array.from({ length: 24 }, (_, k) => {
  const a = (k / 24) * 2 * Math.PI
  const p = off(Math.sin(a) * 320, Math.cos(a) * 420)
  return [p.lng, p.lat]
})
const arena = {
  id: 'a',
  name: 'Titiwangsa',
  boundary: [...ring, ring[0]],
  jail: off(-180, -250),
  start: off(150, 200),
  stations: [off(60, -120), off(-90, 160), off(200, -260)],
} as unknown as View['arena']

let n = 0
const card = (kind: PowerUpKind, over: Partial<PowerUp> = {}): PowerUp => ({
  id: `p${++n}`,
  game_id: 'g1',
  player_id: 'me',
  kind,
  station: 1,
  claimed_at: iso(NOW - 60_000),
  used_at: null,
  consumed_at: null,
  sealed: false,
  taken_at: null,
  offer: null,
  twin_of: null,
  spot: null,
  ...over,
})

const runnerMe = testView().me
const chaserMe = { ...runnerMe, id: 'me', name: 'Ben', role: 'chaser' as const, tag_id: null }

function view(over: Partial<View>, chaser = false): View {
  return testView({
    now: NOW,
    endsAt: NOW + 24 * 60_000,
    nextRevealAt: NOW + 3 * 60_000 + 12_000,
    nextAlertAt: NOW + 2 * 60_000 + 27_000,
    arena,
    settings: { ...testView().settings, mode: 'full' },
    deckLeft: 7,
    me: chaser ? chaserMe : { ...runnerMe, id: 'me' },
    ...over,
  } as Partial<View>)
}

const dot = (id: string, kind: MapDot['kind'], p: { lat: number; lng: number }, over: Partial<MapDot> = {}): MapDot => ({
  id,
  kind,
  ...p,
  revealedBy: null,
  at: iso(NOW - 70_000),
  ...over,
})

const NEW: PowerUpKind[] = ['cheese', 'combo', 'toll']
const OLD: (PowerUpKind | 'bomoh')[] = ['shield', 'cloak', 'decoy', 'toyol', 'grab', 'flare', 'focus', 'along', 'dato', 'bomoh']

function Slot({ title, v }: { title: string; v: View }) {
  return (
    <div className="cell">
      <h3>{title}</h3>
      <div className="dockbox">
        <PowerUpHand code="DEMO" view={v} />
      </div>
    </div>
  )
}

const gostan = card('decoy')
const chaserGate = view(
  {
    hand: [card('toll')],
    tollGates: [off(40, -60)],
    dots: [
      dot('me', 'me', off(-10, 20), { label: 'Ben' }),
      dot('r1', 'runner', off(55, -40), { label: '#07', exact: true, revealedBy: 'toll' }),
      dot('r2', 'runner', off(-120, 150), { label: '#03', fuzzy: true }),
      dot('r3', 'runner', off(180, 120), { label: '#09', fuzzy: true }),
    ],
  },
  true,
)

function App() {
  return (
    <div className="mk">
      <h1>
        New deck cards <span>mockup</span>
      </h1>
      <p>
        Cheese Ais, Nasi Lemak KFC and Tuch and Ga, drawn by the real app components on branch plan-e1-deck-cards with sample
        data. Nothing here talks to the server.
      </p>

      <h2>Stickers</h2>
      <p>The three new doodles (lime captions), next to the existing set so you can judge whether they belong together.</p>
      <div className="row">
        {NEW.map((k) => (
          <div key={k} className="fig new">
            <Sticker kind={k} size={110} tilt={-4} />
            <small>{k === 'cheese' ? 'Cheese Ais' : k === 'combo' ? 'Nasi Lemak KFC' : 'Tuch and Ga'}</small>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        {OLD.map((k) => (
          <div key={k} className="fig">
            <Sticker kind={k} size={72} tilt={-4} />
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {NEW.map((k) => (
          <div key={k} className="fig new">
            <Sticker kind={k} size={40} tilt={-4} />
            <small>slot size</small>
          </div>
        ))}
      </div>

      <h2>Cards</h2>
      <p>The full card, as it flips in the lucky dip and in Abang Grab's offer.</p>
      <div className="row">
        {NEW.map((k) => (
          <PowerCard key={k} kind={k} big />
        ))}
      </div>

      <h2>The slot</h2>
      <p>What sits in the dock on the chase screen, in each new state.</p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Slot title="Runner holding Cheese Ais" v={view({ hand: [card('cheese')], freezeTargets: [{ id: 'c1', name: 'Ben' }, { id: 'c2', name: 'Kim' }] })} />
        <Slot title="A doubled card (Nasi Lemak KFC worked)" v={view({ hand: [gostan, card('decoy', { twin_of: gostan.id, station: null })] })} />
        <Slot title="Combo ready, holding a Durian" v={view({ hand: [card('shield')], comboReady: true })} />
        <Slot title="Combo ready, empty slot" v={view({ hand: [], comboReady: true })} />
        <Slot title="Chaser frozen by Cheese Ais" v={view({ hand: [card('flare')], frozenUntil: NOW + 134_000 }, true)} />
        <Slot title="Chaser frozen, empty slot" v={view({ hand: [], frozenUntil: NOW + 134_000 }, true)} />
        <Slot title="Chaser holding Tuch and Ga" v={view({ hand: [card('toll')] }, true)} />
      </div>

      <h2>Cheese Ais picker</h2>
      <p>Opens straight from the slot. Names only, never what each Kejar holds. Cancel keeps the card.</p>
      <div className="pickerbox">
        <FreezePicker targets={[{ id: 'c1', name: 'Ben' }, { id: 'c2', name: 'Kim' }]} onPick={() => {}} onCancel={() => {}} />
      </div>

      <h2>On the chaser's map</h2>
      <p>
        Drawn with the exact sizes and colours from Map.tsx (the live map needs internet tiles, which this page can't load). Only chasers
        see the GATE pin. The 40 m reach itself is never drawn. Pak Guard's thin ring is shown beside the new soft toll halo for comparison.
      </p>
      <MapKey />

      <h2>New messages</h2>
      <p>The lines players see above the dock and in the feed.</p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Lines
          title="Using a card"
          lines={[
            'Cheese Ais! Ben is frozen for 3 minutes.',
            'No Kejar to freeze right now.',
            "That Kejar can't be frozen right now.",
            'Nasi Lemak KFC! Your next power-up works twice.',
            'Combo! Gostan x2.',
            "Combo already ready. This one's spent.",
            'Wait for your last one to finish first.',
            'Tuch and Ga! Toll gate up. Runners checking in near it get charged.',
            "Can't find you yet. Try again in a moment.",
          ]}
        />
        <Lines
          title="When frozen, and in the feed"
          lines={[
            'Brain freeze! Wait 2:14.',
            'Brain freeze! A runner froze your power-up for 3 minutes.  (the frozen Kejar)',
            'Brain freeze on a Kejar.  (everyone else)',
            "A Dikejar froze Ben's power-up  (marshals only)",
            'A Kejar set a toll gate.  (Kejar only)',
            'A Kejar used Tuch and Ga  (marshals only)',
          ]}
        />
      </div>
    </div>
  )
}

const VOLT = '#C6FF3D'
function MapKey() {
  const fuzzy = (x: number, y: number, label: string) => (
    <g>
      <circle cx={x} cy={y} r={34} fill="rgba(245,245,243,0.10)" stroke="rgba(245,245,243,0.45)" strokeDasharray="3 3" />
      <text x={x} y={y + 4} fill="#F5F5F3" fontSize={11} textAnchor="middle" fontFamily="Geist, sans-serif">
        {label}
      </text>
    </g>
  )
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox="0 0 560 300" width="560" height="300" style={{ background: '#121512', borderRadius: 18, border: '1px solid #222', maxWidth: '100%', height: 'auto' }}>
        <path d="M40 60 Q120 20 280 30 Q470 30 520 110 Q540 220 400 270 Q220 290 90 250 Q20 200 40 60 Z" fill="#17201a" stroke="#2c3a2f" strokeWidth={2} />
        <ellipse cx={330} cy={170} rx={70} ry={38} fill="#0f1a24" />
        {/* toll gate pin: radius 7, black, 3 px lime edge, GATE label */}
        <circle cx={170} cy={120} r={7} fill="#000" stroke={VOLT} strokeWidth={3} />
        <text x={170} y={142} fill={VOLT} fontSize={9} textAnchor="middle" fontFamily="Geist, sans-serif" stroke="#000" strokeWidth={3} paintOrder="stroke">
          GATE
        </text>
        {/* runner #07 revealed by the toll: exact dot with the soft halo (r 15) */}
        <circle cx={200} cy={100} r={15} fill="rgba(198,255,61,0.22)" stroke="rgba(198,255,61,0.55)" strokeWidth={1} />
        <circle cx={200} cy={100} r={5} fill="#F5F5F3" stroke="#000" strokeWidth={1.5} />
        <text x={200} y={80} fill="#F5F5F3" fontSize={11} textAnchor="middle" fontFamily="Geist, sans-serif">
          #07
        </text>
        {/* Pak Guard reveal for comparison: thin ring r 11 */}
        <circle cx={440} cy={90} r={11} fill="none" stroke={VOLT} strokeWidth={2} />
        <circle cx={440} cy={90} r={5} fill="#F5F5F3" stroke="#000" strokeWidth={1.5} />
        <text x={440} y={70} fill="#F5F5F3" fontSize={11} textAnchor="middle" fontFamily="Geist, sans-serif">
          #12 (Pak Guard)
        </text>
        {fuzzy(120, 220, '#03')}
        {fuzzy(460, 210, '#09')}
        {/* the chaser (me) */}
        <circle cx={150} cy={150} r={7} fill="#F5F5F3" stroke="rgba(245,245,243,0.35)" strokeWidth={6} />
        <text x={150} y={172} fill="#F5F5F3" fontSize={10} textAnchor="middle" fontFamily="Geist, sans-serif">
          Ben
        </text>
      </svg>
    </div>
  )
}

function Lines({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="cell" style={{ width: 420, maxWidth: '100%' }}>
      <h3>{title}</h3>
      <div className="dockbox" style={{ display: 'grid', gap: 8 }}>
        {lines.map((l) => (
          <div key={l} style={{ font: '600 13.5px Geist, sans-serif', padding: '10px 12px', background: '#141414', border: '1px solid #262626', borderRadius: 12 }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <MotionRoot>
    <App />
  </MotionRoot>,
)
