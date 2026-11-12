/** The organiser's planned start (home upgrades design): turning a clock reading into a time, and saying it. */

/** The next time this clock reading (`HH:MM`, local) comes round: today, or tomorrow if it has already passed. */
export function nextOccurrence(hhmm: string, now: number): number {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(now)
  d.setHours(h, m, 0, 0)
  if (d.getTime() <= now) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** A time as the `HH:MM` a time input shows, in local time. */
export function clockOf(t: number): string {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** For example "starts 7:30 pm · in 12 min", or "starting soon" once the time has passed. */
export function startsLabel(startsAt: number, now: number): string {
  const left = startsAt - now
  if (left <= 0) return 'starting soon'
  const d = new Date(startsAt)
  const hour = d.getHours() % 12 || 12
  const clock = `${hour}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`
  const min = Math.ceil(left / 60_000)
  const inText = min >= 60 ? `in ${Math.floor(min / 60)} h ${min % 60} min` : `in ${min} min`
  return `starts ${clock} · ${inText}`
}
