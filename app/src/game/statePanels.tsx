import type { ReactNode } from 'react'
import type { PowerUpKind } from '../../shared/types.js'
import type { View } from '../../shared/views.js'
import { heldAt, resetsIn, secondsToHold } from './rescue/rescueTime'
import ComicPanel from './ComicPanel'
import { BackIcon, BangIcon, CameraIcon, ClockIcon, DropIcon, KeyIcon } from './panelIcons'
import { HOW, INFO } from './powerInfo'
import Sticker from './Sticker'
import { clock } from './time'

/**
 * The lasting states as comic panels (design 2026-11-24 §3). Each returns null when its state isn't on, so a screen
 * lists them all and the stack keeps what's there.
 */
const WHITE = '#F5F5F3'
const BLACK = '#0A0A0B'

export function nearPanel(on: boolean): ReactNode {
  if (!on) return null
  return <ComicPanel key="near" colour="#E5484D" ink={BLACK} caption="within 100 m" icon={<BangIcon />} title="Kejar dekat!" line="Lari!" fx="speed" label="Kejar within 100 m" />
}

export function checkinPanel(alertAt: number | null, now: number): ReactNode {
  if (alertAt === null) return null
  return <ComicPanel key="checkin" colour={WHITE} ink={BLACK} caption="check-in" icon={<ClockIcon />} title="Check in" line={`in ${clock(Math.max(0, alertAt - now))}`} label="Check in soon" />
}

export function outPanel(on: boolean): ReactNode {
  if (!on) return null
  return (
    <ComicPanel key="out" colour="#FFD43B" ink={BLACK} caption="luar garisan" icon={<BackIcon />} title="Balik!" line="Back inside within 30 s or you're out" fx="speed" label="Outside the play area" alert />
  )
}

export function floodPanel(view: View, now: number): ReactNode {
  if (!view.wetUntil) return null
  const s = Math.max(0, Math.ceil((view.wetUntil - now) / 1000))
  return <ComicPanel key="flood" colour="#3D8BFD" ink={BLACK} caption="banjir" icon={<DropIcon />} title="In the water!" line={`Dry land in ${s} s`} fx="drip" label="In the water" alert />
}

export function frozenPanel(view: View, now: number): ReactNode {
  if (!view.frozenUntil || view.frozenUntil <= now) return null
  return (
    <ComicPanel
      key="frozen"
      colour="#BFE6FF"
      ink={BLACK}
      caption="cheese ais"
      icon={<Sticker kind="cheese" size={36} />}
      title="Brain freeze!"
      line={`Slot frozen ${clock(view.frozenUntil - now)}`}
      fx="frost"
      label="Your power-up is frozen"
    />
  )
}

export function snapshotPanel(on: boolean): ReactNode {
  if (!on) return null
  return <ComicPanel key="snap" colour={WHITE} ink={BLACK} caption="snapshot" icon={<CameraIcon />} title="Snapshot taken" line="Everyone is on your map" />
}

export function pingPanel(text: string | null): ReactNode {
  if (!text) return null
  const [title, line] = text.split(' · ')
  return <ComicPanel key="ping" colour={WHITE} ink={BLACK} caption="pings" icon={<ClockIcon />} title={title} line={line} />
}

export function rescuePanel(view: View, now: number): ReactNode {
  const rescue = view.rescue
  if (!rescue) return null
  const name = rescue.byName ?? 'A Dikejar'
  const held = heldAt(rescue, now)
  const line = rescue.holdSince === null && held > 0 ? `${name} let go · resets in ${resetsIn(rescue.resetAt, now)} s` : `${name} is breaking them out · ${secondsToHold(held)} s`
  return <ComicPanel key="rescue" colour="#C6FF3D" ink={BLACK} caption="jailbreak" icon={<KeyIcon />} title="Breaking out" line={line} fx="speed" label="Rescue" />
}

const POWER_LOOK: Partial<Record<PowerUpKind, { colour: string; fx?: 'speed' }>> = {
  shield: { colour: '#F1E3C3' },
  flare: { colour: '#C6FF3D', fx: 'speed' },
}

/** My running power-ups, each with its own sticker. */
export function powerPanels(kinds: PowerUpKind[]): ReactNode[] {
  return kinds.map((k, i) => {
    const look = POWER_LOOK[k] ?? { colour: WHITE }
    return (
      <ComicPanel
        key={`power-${k}-${i}`}
        colour={look.colour}
        ink={k === 'shield' ? '#3A2410' : BLACK}
        caption="power-up on"
        icon={<Sticker kind={k} size={36} />}
        title={INFO[k].name}
        line={HOW[k]}
        fx={look.fx}
      />
    )
  })
}
