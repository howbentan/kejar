import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { passesBar, summarise, type DeviceStats } from './stats'
import type { Ack, Checkin, Device, Ping } from './types'

export default function SpikeReport() {
  const [stats, setStats] = useState<DeviceStats[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const [d, p, a, c] = await Promise.all([
        supabase.from('spike_devices').select('*'),
        supabase.from('spike_pings').select('*'),
        supabase.from('spike_acks').select('*'),
        supabase.from('spike_checkins').select('*'),
      ])
      const failed = [d, p, a, c].find((r) => r.error)
      if (failed?.error) {
        setError(failed.error.message)
        return
      }
      setStats(
        summarise(
          (d.data ?? []) as Device[],
          (p.data ?? []) as Ping[],
          (a.data ?? []) as Ack[],
          (c.data ?? []) as Checkin[],
        ),
      )
    })()
  }, [])

  if (error) {
    return (
      <main className="screen">
        <p className="eyebrow">kejar. · ping test · report</p>
        <p className="muted">Couldn&apos;t load results: {error}</p>
      </main>
    )
  }
  if (!stats) {
    return (
      <main className="screen">
        <p className="eyebrow">kejar. · ping test · report</p>
        <p className="muted">Loading…</p>
      </main>
    )
  }

  const bar = passesBar(stats)
  return (
    <main className="screen">
      <p className="eyebrow">kejar. · ping test · report</p>
      <h1
        className="wordmark"
        style={{ color: bar.pass ? 'var(--volt)' : 'var(--white)' }}
        aria-label={bar.pass ? 'Pass' : 'Fail'}
      >
        {bar.pass ? 'PASS' : 'FAIL'}
      </h1>
      <p className="mono">
        {Math.round(bar.arrivalRate * 100)}% on time · {bar.iosDevices} iPhone · {bar.androidDevices} Android
      </p>
      {bar.reasons.length > 0 && (
        <ul className="muted" style={{ paddingLeft: 18 }}>
          {bar.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <table>
        <thead>
          <tr>
            <th>Phone</th>
            <th>On time</th>
            <th>Median</th>
            <th>Check-ins</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.deviceId}>
              <td>
                {s.label}
                <div className="muted" style={{ fontSize: 11 }}>
                  {s.platform}
                </div>
              </td>
              <td className="mono">
                {s.arrivedWithin15s}/{s.pings}
              </td>
              <td className="mono">{s.medianArrivalMs === null ? '—' : `${(s.medianArrivalMs / 1000).toFixed(1)} s`}</td>
              <td className="mono">
                {s.checkins} ({s.checkinsWithLocation} located)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
