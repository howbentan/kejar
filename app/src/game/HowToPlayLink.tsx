import { useState } from 'react'
import type { View } from '../../shared/views.js'
import { call } from './api'
import HowToPlay from './HowToPlay'
import { loadSession } from './session'

/**
 * The in-game "How to play" link: a small text button that sits in its screen's own flow (never fixed over the
 * dock or the SOS icon) and reopens the story. Runners and chasers only.
 */
export default function HowToPlayLink({ code, view }: { code: string; view: View }) {
  const [open, setOpen] = useState(false)
  const side = view.me.role === 'runner' || view.me.role === 'chaser' ? view.me.role : null
  if (!side) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ all: 'unset', cursor: 'pointer', boxSizing: 'border-box', minHeight: 32, display: 'inline-flex', alignItems: 'center', padding: '0 4px', fontSize: 12, opacity: 0.7, textDecoration: 'underline', pointerEvents: 'auto' }}
      >
        How to play
      </button>
      {open && (
        <HowToPlay
          side={side}
          mode={view.settings.mode}
          snapshot={view.settings.chaserSnapshot === true}
          onClose={() => setOpen(false)}
          onReady={() => {
            const token = loadSession(localStorage, code).token
            if (token) void call('briefReady', { code, token }).catch(() => {})
          }}
        />
      )}
    </>
  )
}
