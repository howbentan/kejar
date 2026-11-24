import { useEffect, useState } from 'react'
import { call } from './api'

export type NextSlips = Record<'dikejar' | 'kejar', number | null>

/**
 * This game's slip for each side: the lowest-numbered one not yet used or bound to a game. It's guidance (any unused
 * slip still works), so the organiser knows which printed number goes in which box. Organiser only; null until known.
 */
export function useNextSlips(organiserToken: string | null): NextSlips | null {
  const [next, setNext] = useState<NextSlips | null>(null)
  useEffect(() => {
    if (!organiserToken) return
    let live = true
    call<{ side: 'dikejar' | 'kejar'; number: number; state: string }[]>('listSlips', { organiserToken }).then(
      (slips) => {
        if (!live || !Array.isArray(slips)) return
        const lowest = (side: 'dikejar' | 'kejar') =>
          slips.filter((s) => s.side === side && s.state === 'unused').reduce<number | null>((m, s) => (m === null || s.number < m ? s.number : m), null)
        setNext({ dikejar: lowest('dikejar'), kejar: lowest('kejar') })
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [organiserToken])
  return next
}
