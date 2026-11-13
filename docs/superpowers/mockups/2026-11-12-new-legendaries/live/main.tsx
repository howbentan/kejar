// Mockup of Plan E2's legendaries, rendered with the real app components and sample data.
// Dev only. Build with: node mockups/e2/build.mjs (from app/). Not part of the app build.
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionRoot } from '../../src/game/motion'
import '../../src/styles/tokens.css'
import Sticker from '../../src/game/Sticker'
import PowerCard from '../../src/game/PowerCard'
import PowerUpHand from '../../src/game/PowerUpHand'
import HijauTakeover from '../../src/game/HijauTakeover'
import Marker from '../../src/game/Marker'
import Stamp from '../../src/game/Stamp'
import GameMap from '../../src/game/Map'
import HouseArrest from '../../src/screens/HouseArrest'
import Jail from '../../src/screens/Jail'
import { testView } from '../../src/screens/testView'
import type { PowerUp } from '../../shared/types'
import type { View } from '../../shared/views'

const NOW = Date.now()
const iso = (t: number) => new Date(t).toISOString()
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
  stations: [],
} as unknown as View['arena']

const me = { ...testView().me, id: 'me', name: 'Aina' }

function view(over: Partial<View>): View {
  return testView({
    now: NOW,
    endsAt: NOW + 24 * 60_000,
    arena,
    settings: { ...testView().settings, mode: 'full' },
    me,
    ...over,
  } as Partial<View>)
}

const ringCard: PowerUp = {
  id: 'ring1',
  game_id: 'g1',
  player_id: 'me',
  kind: 'ring',
  station: null,
  claimed_at: iso(NOW - 60_000),
  used_at: null,
  consumed_at: null,
  sealed: false,
  taken_at: null,
  offer: null,
  twin_of: null,
  spot: null,
}

const meDot = (p: { lat: number; lng: number }) => ({ id: 'me', kind: 'me' as const, ...p, label: 'Aina', revealedBy: null, at: iso(NOW) })
const center = off(30, -40)

function Phone({ children, title, note }: { children: React.ReactNode; title: string; note?: string }) {
  return (
    <div className="cell" style={{ width: 360 }}>
      <h3>{title}</h3>
      <div className="phone">{children}</div>
      {note && <p className="note">{note}</p>}
    </div>
  )
}

// ---- Safe screen tick options (mockup only) ----
const TICK = 'M142 222 C156 262 166 290 186 326 C206 362 228 412 252 464 C300 408 356 338 410 264 C466 186 524 104 584 22'
function SafeOption({ kind }: { kind: 'loop' | 'black' | 'sticker' | 'today' }) {
  const title = useRef<HTMLHeadingElement>(null)
  const tickSvg = (stroke: string, width: number, extra?: React.ReactNode) => (
    <svg viewBox="100 0 520 500" width="100%" height="100%" style={{ overflow: 'visible' }} aria-hidden="true">
      {extra}
      <path d={TICK} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  let mark: React.ReactNode
  if (kind === 'loop') {
    // A wobbly hand-drawn loop, overshooting its start like the marker circles.
    const loop = 'M560 120 C600 260 520 470 330 490 C150 505 70 360 110 210 C150 70 330 10 470 50 C540 70 580 110 590 150'
    mark = <div style={{ width: 230, height: 230 }}>{tickSvg('#0A0A0B', 52, <path d={loop} fill="none" stroke="#0A0A0B" strokeWidth={12} strokeLinecap="round" />)}</div>
  } else if (kind === 'black') {
    mark = (
      <div style={{ width: 220, height: 220, borderRadius: '50%', background: 'var(--black)', display: 'grid', placeItems: 'center' }}>
        <div style={{ width: '60%', height: '60%' }}>{tickSvg('var(--hijau-2)', 52)}</div>
      </div>
    )
  } else if (kind === 'sticker') {
    mark = (
      <div style={{ width: 210, height: 210, transform: 'rotate(-6deg)' }}>
        <svg viewBox="80 -20 560 540" width="100%" height="100%" style={{ overflow: 'visible' }} aria-hidden="true">
          <path d={TICK} fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth={108} strokeLinecap="round" strokeLinejoin="round" transform="translate(0 14)" />
          <path d={TICK} fill="none" stroke="#F5F5F3" strokeWidth={108} strokeLinecap="round" strokeLinejoin="round" />
          <path d={TICK} fill="none" stroke="#0A0A0B" strokeWidth={56} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  } else {
    mark = (
      <div style={{ width: 240, height: 240, borderRadius: '50%', background: 'var(--hijau-1)', border: '6px solid #0A0A0B', display: 'grid', placeItems: 'center' }}>
        <div style={{ width: '64%', height: '64%' }}>{tickSvg('#0A0A0B', 50)}</div>
      </div>
    )
  }
  return (
    <div style={{ ...screen, background: G, color: 'var(--black)', justifyContent: 'center', gap: 18 }}>
      <p className="eyebrow" style={{ color: 'var(--black)', opacity: 0.7 }}>
        MAK KAU HIJAU · LEGENDARY
      </p>
      <h1 ref={title} style={{ font: '800 44px var(--font)', letterSpacing: '-0.06em', lineHeight: 1, margin: 0 }}>
        safe!
      </h1>
      {mark}
      <p style={{ margin: 0, font: '700 16px var(--font)', maxWidth: 280 }}>Safe! You touched green. The Kejar can see where you tapped.</p>
      {kind !== 'today' && <Marker marks={[{ shape: 'stars', target: title }]} colour="black" />}
    </div>
  )
}

function SafeOther({ kind }: { kind: 'stamp' | 'makcik' | 'leaf' }) {
  const art = useRef<HTMLDivElement>(null)
  const O = { stroke: '#0A0A0B', strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  let body: React.ReactNode
  if (kind === 'stamp') {
    body = (
      <div ref={art} className="catch-stamp" style={{ padding: '30px 20px' }}>
        <Stamp text="safe!" plate />
      </div>
    )
  } else if (kind === 'makcik') {
    body = (
      <div ref={art} style={{ position: 'relative', paddingTop: 70 }}>
        <div style={{ position: 'absolute', top: 0, right: -24, background: 'var(--black)', color: 'var(--white)', borderRadius: 16, padding: '10px 14px', font: '800 18px var(--font)', letterSpacing: '-0.03em', transform: 'rotate(4deg)' }}>
          Good one!
          <span style={{ position: 'absolute', left: 22, bottom: -10, width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '12px solid var(--black)' }} />
        </div>
        <Sticker kind="hijau" size={200} tilt={-4} />
      </div>
    )
  } else {
    body = (
      <div ref={art} style={{ width: 220, height: 220 }}>
        <svg viewBox="-10 -10 120 120" width="100%" height="100%" aria-hidden="true" style={{ overflow: 'visible' }}>
          <g filter="url(#none)">
            <path d="M18 70 Q10 30 52 16 Q92 6 92 42 Q90 78 50 84 Q30 86 18 70 Z" fill="#7BCB4F" {...O} strokeWidth={4} />
            <path d="M22 72 Q52 52 86 26" fill="none" {...O} strokeWidth={3} />
            <path d="M40 58 L36 42 M58 46 L56 30 M70 38 L76 26" fill="none" stroke="#3F8F2E" strokeWidth={2.5} strokeLinecap="round" />
            <path d="M58 112 L56 88 Q55 78 62 77 Q69 77 69 86 L70 98" fill="#C68B59" {...O} />
            <path d="M54 112 Q44 104 46 96 Q48 90 56 92" fill="#C68B59" {...O} />
            <path d="M58 112 L56 88 Q55 78 62 77 Q69 77 69 86 L70 98 Q78 96 80 104 L80 112 Z" fill="#C68B59" {...O} />
            <path d="M58 70 L66 76" stroke="#0A0A0B" strokeWidth={0} />
          </g>
        </svg>
      </div>
    )
  }
  return (
    <div style={{ ...screen, background: G, color: 'var(--black)', justifyContent: 'center', gap: 18 }}>
      <p className="eyebrow" style={{ color: 'var(--black)', opacity: 0.7 }}>
        MAK KAU HIJAU · LEGENDARY
      </p>
      {kind !== 'stamp' && <h1 style={{ font: '800 44px var(--font)', letterSpacing: '-0.06em', lineHeight: 1, margin: 0 }}>safe!</h1>}
      {body}
      <p style={{ margin: 0, font: '700 16px var(--font)', maxWidth: 280 }}>You touched green. The Kejar can see where you tapped.</p>
      <Marker marks={[{ shape: kind === 'leaf' ? 'burst' : 'stars', target: art }]} colour="black" />
    </div>
  )
}

// ---- Tap screen options (mockup only) ----
const G = 'var(--hijau-2)'
const screen: React.CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '28px 20px', gap: 14 }
const mono = (size: number, weight = 700): React.CSSProperties => ({ font: `${weight} ${size}px var(--mono)`, letterSpacing: '-0.02em' })
const pill = (bg: string, fg: string): React.CSSProperties => ({ appearance: 'none', border: 0, borderRadius: 999, padding: '18px 22px', width: '100%', background: bg, color: fg, font: '800 20px var(--font)', letterSpacing: '-0.03em' })

/** Five segments draining left to right, like the check-in strikes. */
function Segments({ left, total, on, off }: { left: number; total: number; on: string; off: string }) {
  const n = 10
  const lit = Math.round((left / total) * n)
  return (
    <div style={{ display: 'flex', gap: 4, width: '100%' }}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i < lit ? on : off }} />
      ))}
    </div>
  )
}

function TapA() {
  const title = useRef<HTMLParagraphElement>(null)
  return (
    <div style={{ ...screen, background: G, color: 'var(--black)', justifyContent: 'center' }}>
      <p className="eyebrow" style={{ color: 'var(--black)', opacity: 0.7 }}>
        MAK KAU HIJAU · LEGENDARY
      </p>
      <Sticker kind="hijau" size={150} tilt={-4} />
      <p ref={title} style={{ font: '800 44px var(--font)', letterSpacing: '-0.06em', lineHeight: 1, margin: 0 }}>
        mak kau hijau!
      </p>
      <div style={{ width: '100%', background: 'var(--black)', color: 'var(--white)', borderRadius: 16, padding: '14px 16px', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="eyebrow">TAP IN</span>
          <span style={{ ...mono(34), color: G }}>0:14</span>
        </div>
        <Segments left={14} total={20} on={G} off="#2a2a2a" />
        <p style={{ margin: 0, fontSize: 13, color: 'var(--dim)', textAlign: 'left' }}>Miss it and you go to Penjara. Tap and the Kejar see where you are.</p>
      </div>
      <button type="button" style={pill('var(--black)', G)}>
        Tap the green
      </button>
      <Marker marks={[{ shape: 'underline', target: title }, { shape: 'stars', target: title }]} colour="black" />
    </div>
  )
}

function TapB() {
  const btn = useRef<HTMLButtonElement>(null)
  return (
    <div style={{ ...screen, background: 'rgba(10,10,11,0.96)', color: 'var(--white)', justifyContent: 'center', gap: 22 }}>
      <p className="eyebrow">A KEJAR FOUND SOMETHING LEGENDARY</p>
      <div style={{ paddingTop: 26 }}>
        <PowerCard kind="hijau" />
      </div>
      <p style={{ font: '800 30px var(--font)', letterSpacing: '-0.05em', margin: 0, lineHeight: 1.05 }}>Tap the green, quick.</p>
      <p style={{ ...mono(44), color: G, margin: 0 }}>0:14</p>
      <button ref={btn} type="button" style={pill(G, 'var(--black)')}>
        Tap the green
      </button>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--dim)' }}>Miss it: Penjara. Tap: the Kejar see where you are.</p>
      <Marker marks={[{ shape: 'burst', target: btn }]} colour="white" />
    </div>
  )
}

function TapC() {
  const r = 104
  const c = 2 * Math.PI * r
  const left = 14 / 20
  return (
    <div style={{ ...screen, background: 'var(--black)', color: 'var(--white)', justifyContent: 'space-between' }}>
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, border: `1.5px solid ${G}`, borderRadius: 16, padding: '10px 12px', textAlign: 'left' }}>
        <Sticker kind="hijau" size={44} tilt={-4} />
        <div>
          <b style={{ display: 'block', color: G, fontSize: 15 }}>Mak kau hijau!</b>
          <span style={{ fontSize: 12, color: 'var(--dim)' }}>Tap within 20 s or go to Penjara.</span>
        </div>
      </div>
      <div style={{ position: 'relative', width: 240, height: 240 }}>
        <svg width="240" height="240" viewBox="0 0 240 240" style={{ position: 'absolute', inset: 0 }}>
          <circle cx="120" cy="120" r={r} fill="none" stroke="#222" strokeWidth="10" />
          <circle cx="120" cy="120" r={r} fill="none" stroke={G} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c * left} ${c}`} transform="rotate(-90 120 120)" />
        </svg>
        <button type="button" style={{ position: 'absolute', inset: 22, borderRadius: '50%', border: 0, background: G, color: 'var(--black)', display: 'grid', placeItems: 'center', alignContent: 'center', gap: 4 }}>
          <span style={{ font: '800 26px var(--font)', letterSpacing: '-0.04em' }}>TAP</span>
          <span style={mono(22)}>0:14</span>
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--dim)' }}>Tapping shows the Kejar where you are.</p>
    </div>
  )
}

/** Taps the green button by itself, shows Safe with the tick, then starts again, so the page shows both states. */
function AutoTap() {
  const [round, setRound] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const tap = window.setTimeout(() => box.current?.querySelector<HTMLButtonElement>('.hijau-takeover button:not([disabled])')?.click(), 900)
    const again = window.setTimeout(() => setRound((r) => r + 1), 4200)
    return () => {
      window.clearTimeout(tap)
      window.clearTimeout(again)
    }
  }, [round])
  const t = Date.now()
  return (
    <div ref={box} key={round} style={{ height: '100%' }}>
      <HijauTakeover
        view={view({ now: t, hijau: { claimedAt: t - 5_000 - round, startsAt: t - 5_000, deadline: t + 15_000, tapped: false } })}
        onTap={() => Promise.resolve({ ok: true })}
      />
    </div>
  )
}

function App() {
  return (
    <div className="mk">
      <h1>
        New legendaries <span>mockup</span>
      </h1>
      <p>
        Super Ring and Mak Kau Hijau, drawn by the real app components from the Plan E2 branch with sample data. Nothing here talks to the
        server. Maps need internet tiles, which this page can't always load, so the map backgrounds may show blank.
      </p>

      <h2>Stickers</h2>
      <p>Super Ring is now a doodle of the snack packet; Mak Kau Hijau is a mak cik in full green. Shown next to the legendaries they share a side with.</p>
      <div className="row">
        {(
          [
            ['ring', 'Super Ring', true],
            ['dato', 'Dato Seri', false],
            ['hijau', 'Mak Kau Hijau', true],
            ['bomoh', 'Bomoh', false],
          ] as const
        ).map(([k, name, isNew]) => (
          <div key={k} className={`fig${isNew ? ' new' : ''}`}>
            <Sticker kind={k} size={110} tilt={-4} />
            <small>{name}</small>
          </div>
        ))}
      </div>

      <h2>Legendary cards</h2>
      <p>
        The legendary cards are now the same dark card as every power-up, framed in their own colour, with marker scribbles round the
        outside (a crown, stars, rays) to say it's the powerful one. No more gradient, foil or glow. Small and big sizes shown.
      </p>
      <div className="row" style={{ gap: 64, marginBottom: 28, paddingTop: 30 }}>
        <PowerCard kind="dato" />
        <PowerCard kind="ring" />
        <PowerCard kind="hijau" />
        <PowerCard kind="shield" />
      </div>
      <div className="row" style={{ gap: 80, paddingTop: 40, paddingLeft: 30 }}>
        <PowerCard kind="dato" big />
        <PowerCard kind="ring" big />
        <PowerCard kind="hijau" big />
      </div>

      <h2>Holding Super Ring</h2>
      <p>The slot while Super Ring waits, now a plain outline in Super Ring orange like every other slot. No Use button: it fires by itself the next time you would go to Penjara.</p>
      <div className="cell">
        <div className="dockbox">
          <PowerUpHand code="DEMO" view={view({ hand: [ringCard] })} />
        </div>
      </div>

      <h2>House arrest</h2>
      <p>The screen a runner sees when Super Ring fires, while waiting for them to open Kejar, and when they're let go.</p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Phone title="Running (1:42 left)">
          <HouseArrest code="DEMO" view={view({ arrest: { endsAt: NOW + 102_000, center, openBy: null }, dots: [meDot(off(36, -30))] })} />
        </Phone>
        <Phone title="Waiting for Kejar to open" note="After auto-jail or Mak Kau Hijau, the runner gets 60 s to open Kejar.">
          <HouseArrest code="DEMO" view={view({ arrest: { endsAt: null, center: null, openBy: NOW + 48_000 } })} />
        </Phone>
        <Phone title="Let go">
          <HouseArrest code="DEMO" released view={view({ arrest: null, dots: [meDot(off(36, -30))] })} />
        </Phone>
      </div>

      <h2>Safe screen: tick options</h2>
      <p>Three ways to show your tick once a Dikejar taps in time. Today's built version is on the right.</p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Phone title="1 · Just the tick, circled in marker" note="No disc. Your bold tick straight on the green, with a hand-drawn marker loop round it.">
          <SafeOption kind="loop" />
        </Phone>
        <Phone title="2 · Black disc, green tick" note="A flat black disc like the panel and pill on the tap screen, with the tick in green.">
          <SafeOption kind="black" />
        </Phone>
        <Phone title="3 · Sticker tick" note="The tick as a doodle sticker: thick white edge and drop shadow, like the power-up stickers.">
          <SafeOption kind="sticker" />
        </Phone>
        <Phone title="Today">
          <SafeOption kind="today" />
        </Phone>
      </div>

      <h2>Safe screen: options without a tick</h2>
      <p>Three other ways to say "you made it", each tied to something already in the app.</p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Phone title="4 · The safe! stamp" note="A stamp slams in, the same stamp as the catch's dikejar! moment, on a black plate.">
          <SafeOther kind="stamp" />
        </Phone>
        <Phone title="5 · The mak cik approves" note="A big mak cik sticker with a speech bubble, like she's letting you off.">
          <SafeOther kind="makcik" />
        </Phone>
        <Phone title="6 · You touched green" note="A big doodle of a finger on a leaf, with marker rays. The joke, drawn out.">
          <SafeOther kind="leaf" />
        </Phone>
      </div>

      <h2>Tap screen: earlier options</h2>
      <p>
        Three takes on the Mak Kau Hijau tap screen in the app's own style: flat colour, Geist type, mono numbers, pill buttons and
        marker doodles, with no gradients or shine. All show 14 s left of the 20 s. Today's version is on the right for comparison.
      </p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Phone title="A · Like the SOS takeover" note="Full-bleed flat green, black panel with the countdown and draining bar, a big black pill to tap.">
          <TapA />
        </Phone>
        <Phone title="B · Like a moment" note="Dark screen like the catch and lucky-dip moments. The legendary card with its scribbles, then a flat green pill.">
          <TapB />
        </Phone>
        <Phone title="C · Like the check-in banner" note="Black, minimal. One flat green button with a draining ring, the time inside it.">
          <TapC />
        </Phone>
        <Phone title="Today">
          <HijauTakeover
            view={view({ paused: true, hijau: { claimedAt: NOW - 6_000, startsAt: NOW - 6_000, deadline: NOW + 14_000, tapped: false } })}
            onTap={() => new Promise(() => {})}
          />
        </Phone>
      </div>

      <h2>Mak kau hijau!</h2>
      <p>The built tap screen (option A): 20 s, tapping shows you to the Kejar, missing sends you to Penjara, which then locks for 3 minutes. The middle phone taps itself on a loop to show the Safe screen.</p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Phone title="The tap screen (14 s left)">
          <HijauTakeover
            view={view({ paused: true, hijau: { claimedAt: NOW - 7_000, startsAt: NOW - 7_000, deadline: NOW + 14_000, tapped: false } })}
            onTap={() => new Promise((r) => setTimeout(() => r({ ok: true }), 600))}
          />
        </Phone>
        <Phone title="Tapped: Safe! (replays on a loop)">
          <AutoTap />
        </Phone>
        <Phone title="Missed it: Penjara (locked)">
          <Jail code="DEMO" view={view({ phase: 'chasing', me: { ...me, jailed: true, caught_at: iso(NOW - 20_000) }, jailReason: 'hijau', jailCheckins: [], penjaraLockedUntil: NOW + 134_000 })} />
        </Phone>
        <Phone title="Left the house-arrest circle">
          <Jail code="DEMO" view={view({ phase: 'chasing', me: { ...me, jailed: true, caught_at: iso(NOW - 20_000) }, jailReason: 'bail-revoked', jailCheckins: [] })} />
        </Phone>
      </div>

      <h2>Hint zones on the map</h2>
      <p>Each legendary's hidden card shows as an unlabelled ? zone in its own colour. One runner and one chaser legendary per game.</p>
      <div className="mapbox">
        <GameMap
          arena={arena}
          dots={[]}
          height={380}
          showJailAndStart={false}
          legendaryZone={{ ...off(215, 90), radiusM: 70 }}
          ringZone={{ ...off(215, 310), radiusM: 70 }}
          bomohZone={{ ...off(85, 90), radiusM: 70 }}
          hijauZone={{ ...off(85, 310), radiusM: 70 }}
        />
      </div>
      <p className="note">Shown together only for comparison: yellow Dato Seri, orange Super Ring, purple Bomoh, green Mak Kau Hijau.</p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <MotionRoot>
    <App />
  </MotionRoot>,
)
