import * as m from 'motion/react-m'
import { useRef } from 'react'
import type { View } from '../../shared/views.js'
import timeOut from '../assets/pause-timeout.webp'
import Marker from '../game/Marker'
import { clock } from '../game/time'
import { Screen } from '../game/ui'

/**
 * Shown to players while a marshal has the game paused; the clock stays frozen. The time-out photo (used with the
 * photographer's permission, owner's decision 2026-11-02) gets a marker frame — the owner chose to bend the
 * "no marker on pause" rule of motion design §8.5 for this screen.
 */
export default function Paused({ view }: { view: View }) {
  const photo = useRef<HTMLImageElement>(null)
  return (
    <Screen eyebrow="Paused">
      <div className="paused">
        <h1 className="paused-title">Game paused</h1>
        <div className="paused-photo">
          <m.img
            ref={photo}
            src={timeOut}
            alt="Time out"
            width={736}
            height={1024}
            initial={{ rotate: -6, scale: 0.9, opacity: 0 }}
            animate={{ rotate: -3, scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          />
          <Marker
            marks={[
              { shape: 'frame', target: photo },
              { shape: 'stars', target: photo },
            ]}
            delayMs={400}
          />
        </div>
        <p className="mono paused-clock">{clock((view.endsAt ?? view.now) - view.now)}</p>
        <p className="muted">Stay where you are. A marshal will restart the game.</p>
      </div>
    </Screen>
  )
}
