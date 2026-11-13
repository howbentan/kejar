import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import EndgameLogo, { ENDGAME_COPY } from './EndgameLogo'

afterEach(cleanup)

describe('EndgameLogo (endgame design §6.4)', () => {
  it('draws each of the four stickers, named for screen readers', () => {
    for (const kind of ['bomba', 'hebat', 'pkp', 'banjir'] as const) {
      render(<EndgameLogo kind={kind} size={40} />)
      expect(screen.getByRole('img', { name: ENDGAME_COPY[kind].name })).toHaveAttribute('width', '40')
      cleanup()
    }
  })

  it("two logos on one screen never share their filters' ids", () => {
    const { container } = render(
      <>
        <EndgameLogo kind="bomba" />
        <EndgameLogo kind="pkp" />
      </>,
    )
    const ids = [...container.querySelectorAll('filter')].map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps the spec\'s titles, colours and copy, with no em-dashes', () => {
    expect(ENDGAME_COPY.bomba.title).toBe('bomba!')
    expect(ENDGAME_COPY.hebat.title).toBe('hang hebat!')
    expect(ENDGAME_COPY.pkp.title).toBe('pkp!')
    expect(ENDGAME_COPY.pkp.when).toBe('5 MINUTES LEFT · ENDGAME')
    expect(ENDGAME_COPY.bomba.rule).toBe('Pings every 2 minutes now, then every minute from 5 minutes left.')
    expect(ENDGAME_COPY.pkp.colour).toBe('var(--pkp)')
    expect(JSON.stringify(ENDGAME_COPY)).not.toMatch(/—/)
  })
})
