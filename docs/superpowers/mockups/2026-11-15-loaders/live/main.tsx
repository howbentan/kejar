// Loader options mockup: where the home screen's running j could show while the app waits. Not part of the app.
import { useEffect, useRef, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/styles/tokens.css'
import HomeLogo from '../../src/game/homeLogo/HomeLogo'
import { pose, STRIDE } from '../../src/game/homeLogo/stride'

const n = (v: number) => String(Math.round(v * 100) / 100)

/** The logo's j on its own, running on the spot: the same drawing and stride as the home logo, at any size. */
function MiniRunner({ height = 22, colour = 'var(--volt)' }: { height?: number; colour?: string }) {
  const run = useRef<SVGGElement>(null)
  const legL = useRef<SVGPathElement>(null)
  const legR = useRef<SVGPathElement>(null)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = pose(((now - start) / 1000) * STRIDE.CADENCE, 1, Infinity)
      if (run.current) run.current.style.transform = `translateY(${n(p.lift)}px) rotate(${n(p.tilt)}deg)`
      if (legL.current) legL.current.style.transform = `rotate(${n(p.legL)}deg)`
      if (legR.current) legR.current.style.transform = `rotate(${n(p.legR)}deg)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  const s = { fill: 'none', stroke: colour, strokeWidth: 40, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg viewBox="-20 -20 366 559" width={(height * 366) / 559} height={height} aria-hidden="true" style={{ overflow: 'visible', flex: 'none' }}>
      <g ref={run} style={{ transformBox: 'view-box', transformOrigin: '168px 500px' }}>
        <ellipse {...s} cx="190" cy="61" rx="59" ry="40" />
        <path {...s} d="M157 156 Q169 200 167 260 L168 338" />
        <path ref={legL} {...s} d="M168 338 Q164 400 144 428 Q122 458 88 460 L22 460" style={{ transformBox: 'view-box', transformOrigin: '168px 338px' }} />
        <path ref={legR} {...s} d="M168 338 Q236 326 272 380 Q300 424 302 498" style={{ transformBox: 'view-box', transformOrigin: '168px 338px' }} />
      </g>
    </svg>
  )
}

const Dots = () => (
  <span className="dots" aria-hidden="true">
    <i>.</i>
    <i>.</i>
    <i>.</i>
  </span>
)

/** The full-size loader: the home logo at its home spot, the j running on the spot, a caption under it. */
function FullLoader({ caption }: { caption: string }) {
  return (
    <main className="home" style={{ minHeight: '100%', height: '100%' }}>
      <div className="home-play">
        <HomeLogo mode="loading" caption={<>{caption}<Dots /></>} />
      </div>
    </main>
  )
}

function Phone({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="fig" style={{ textAlign: 'left' }}>
      <h3 style={{ fontSize: 14, margin: '0 2px 8px', fontWeight: 600 }}>{title}</h3>
      <div className="phone">
        <div style={{ height: '100%', overflow: 'hidden' }}>{children}</div>
      </div>
      {note && <p className="note">{note}</p>}
    </div>
  )
}

/** The Join game form, with what its button shows while joining. */
function JoinScreen({ button }: { button: ReactNode }) {
  return (
    <main className="screen">
      <p className="eyebrow">JOIN GAME ABC234</p>
      <label className="eyebrow">Your name</label>
      <input className="input" defaultValue="Aina" readOnly />
      <label className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" defaultChecked readOnly />
        <span>No grabbing, no tackling. One hand, arm only. “Stop” means stop.</span>
      </label>
      <label className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" defaultChecked readOnly />
        <span>I accept the waiver and share my location during this game only.</span>
      </label>
      {button}
    </main>
  )
}

/** The player's lobby while they wait for the organiser, with what the waiting line shows. */
function LobbyScreen({ waiting }: { waiting: ReactNode }) {
  return (
    <main className="screen">
      <p className="eyebrow">kejar. · game ABC234</p>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.05em', margin: '4px 0' }}>You're in, Aina.</h1>
      <div className="card">Your tag: #07</div>
      <button type="button" className="btn btn-ghost">
        How to play
      </button>
      {waiting}
    </main>
  )
}

const waitingText = <p className="muted">Waiting for the organiser to start the game…</p>
const waitingMini = (
  <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <MiniRunner height={30} />
    Waiting for the organiser to start the game
  </p>
)
const joinText = (
  <button className="btn" disabled>
    Joining…
  </button>
)
const joinMini = (
  <button className="btn" aria-busy="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
    <MiniRunner height={26} colour="var(--black)" />
    Joining
  </button>
)

/** A small labelled card for one button or line, as it looks while waiting. */
function Cell({ n, title, note, children }: { n: number; title: string; note?: string; children: ReactNode }) {
  return (
    <div className="cell">
      <h3>
        <span style={{ color: '#C6FF3D', marginRight: 6 }}>{n}</span>
        {title}
      </h3>
      <div className="dockbox" style={{ display: 'grid', gap: 10 }}>
        {children}
      </div>
      {note && <p className="note">{note}</p>}
    </div>
  )
}

/** A button mid-wait: the small j running where the text's ellipsis used to be. */
function Busy({ label, ghost, legendary, flex }: { label: string; ghost?: boolean; legendary?: boolean; flex?: boolean }) {
  const cls = `btn${ghost ? ' btn-ghost' : ''}${legendary ? ' btn-legendary' : ''}`
  const colour = ghost ? 'var(--volt)' : legendary ? 'var(--legendary-ink)' : 'var(--black)'
  return (
    <button className={cls} aria-busy="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, ...(flex ? { flex: 1 } : {}) }}>
      <MiniRunner height={26} colour={colour} />
      {label}
    </button>
  )
}

/** A long wait: the small j beside the line, which loses its ellipsis. */
const Waiting = ({ text }: { text: string }) => (
  <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
    <MiniRunner height={30} />
    {text}
  </p>
)

function App() {
  return (
    <div className="mk">
      <h1>
        Loaders across Kejar<span>.</span>
      </h1>
      <p>
        Option A in every place the app waits. Screens with nothing to show yet get the home screen's running logo. Buttons keep their place and run a small j
        while they wait. Long waits run a small j beside their line. Numbers match the list in chat.
      </p>

      <h2>Full-size: the screen has nothing to show yet</h2>
      <p>The home logo at its home spot, the j running on the spot, with a caption that has a bit of Malaysian flavour. Opening a game (7) already works this way; its caption would change too.</p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Phone title="1 · Organise game: saved parks">
          <FullLoader caption="JAP, LOADING YOUR PARKS" />
        </Phone>
        <Phone title="2 · Organiser's lobby">
          <FullLoader caption="SABAR KEJAP, OPENING ABC234" />
        </Phone>
        <Phone title="3 · Walk the park">
          <FullLoader caption="JOM JALAN, LOADING THE WALK" />
        </Phone>
        <Phone title="4 · Your kit">
          <FullLoader caption="TUNGGU JAP, PACKING YOUR KIT" />
        </Phone>
        <Phone title="5 · Moving to a new phone">
          <FullLoader caption="PINDAH RUMAH, MOVING YOU OVER" />
        </Phone>
        <Phone title="6 · Park setup: after picking a park" note="While the park's outline and lakes load.">
          <FullLoader caption="KEJAP JE, MAPPING KLCC" />
        </Phone>
        <Phone title="7 · Opening a game (already built)">
          <FullLoader caption="JOM, LOADING GAME ABC234" />
        </Phone>
      </div>

      <h2>Small j inside the button</h2>
      <p>The button stays put and stays tappable-looking, so nothing jumps. The label drops its "…" because the j shows it's working.</p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Cell n={8} title="Joining and signing in">
          <Busy label="Joining" />
          <Busy label="Joining as marshal" />
          <Busy label="Signing in" />
        </Cell>
        <Cell n={9} title="Creating">
          <Busy label="Creating game" />
          <Busy label="Making invite link" ghost />
        </Cell>
        <Cell n={10} title="Park search and save">
          <Busy label="Searching" />
          <Busy label="Saving park" />
        </Cell>
        <Cell n={11} title="Organiser lobby" note="Today these only grey out.">
          <Busy label="Starting game" />
          <Busy label="Switching to Full" ghost />
          <Busy label="Inviting marshal" ghost />
          <div style={{ display: 'flex', gap: 8 }}>
            <Busy label="Dikejar" ghost flex />
            <Busy label="Kejar" ghost flex />
          </div>
        </Cell>
        <Cell n={12} title="Scan, while it's checked" note="A catch, station or stash scan waiting on the server.">
          <div style={{ display: 'flex', gap: 8 }}>
            <Busy label="Checking" flex />
          </div>
        </Cell>
        <Cell n={13} title="Power-ups">
          <Busy label="Using Durian" />
          <Busy label="Picking card" ghost />
        </Cell>
        <Cell n={14} title="Everything else that sends">
          <Busy label="Settling" legendary />
          <Busy label="Dropping card" />
          <div style={{ display: 'flex', gap: 8 }}>
            <Busy label="Undoing" flex />
            <Busy label="Marking" ghost flex />
          </div>
          <Busy label="Sending rating" />
          <Busy label="Sending report" />
        </Cell>
      </div>

      <h2>Small j beside the line: long waits</h2>
      <p>Waits that can last minutes. The line keeps its words and loses its "…".</p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Cell n={15} title="Player's lobby">
          <Waiting text="Waiting for the organiser to give you a role" />
          <Waiting text="Waiting for the organiser to start the game" />
        </Cell>
        <Cell n={16} title="Walk the park">
          <Waiting text="Finding you" />
        </Cell>
        <Cell n={17} title="Park search">
          <Waiting text="Finding parks near KLCC" />
        </Cell>
      </div>

      <h2>Optional: the map while its tiles load</h2>
      <p>Today a plain dark box shows for a moment. A small j could run in the middle until the map appears.</p>
      <div className="row">
        <div className="cell">
          <div className="dockbox" style={{ height: 220, display: 'grid', placeItems: 'center', background: '#121314' }}>
            <MiniRunner height={42} />
          </div>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
