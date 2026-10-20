import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Device, Ping } from './types'

interface SendResponse {
  pingId: string | null
  sent: number
  expired: string[]
  failed: string[]
  error?: string
}

export default function SpikeAdmin() {
  const [devices, setDevices] = useState<Device[]>([])
  const [pings, setPings] = useState<Ping[]>([])
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState('')

  const load = useCallback(async () => {
    const [d, p] = await Promise.all([
      supabase.from('spike_devices').select('*').order('created_at'),
      supabase.from('spike_pings').select('*').order('sent_at', { ascending: false }).limit(10),
    ])
    setDevices((d.data ?? []) as Device[])
    setPings((p.data ?? []) as Ping[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function sendPing() {
    setSending(true)
    try {
      const res = await fetch('/api/send-ping', { method: 'POST' })
      const body = (await res.json()) as SendResponse
      if (!res.ok) setResult(`Error: ${body.error ?? res.status}`)
      else if (body.pingId === null) setResult('No active devices.')
      else setResult(`Sent ${body.sent} · expired ${body.expired.length} · failed ${body.failed.length}`)
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSending(false)
      void load()
    }
  }

  return (
    <main className="screen">
      <p className="eyebrow">kejar. · ping test · admin</p>
      <button className="btn" onClick={sendPing} disabled={sending}>
        {sending ? 'Sending…' : 'Send ping'}
      </button>
      {result && (
        <p className="muted" role="status">
          {result}
        </p>
      )}

      <p className="eyebrow">Devices ({devices.length})</p>
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Platform</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id}>
              <td>{d.label}</td>
              <td>{d.platform}</td>
              <td>{d.active ? 'yes' : 'no'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="eyebrow">Last 10 pings</p>
      <table>
        <thead>
          <tr>
            <th>Sent</th>
            <th>Delivered to</th>
          </tr>
        </thead>
        <tbody>
          {pings.map((p) => (
            <tr key={p.id}>
              <td className="mono">{new Date(p.sent_at).toLocaleTimeString()}</td>
              <td>{p.sent_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <a className="muted" href="/spike/report">
        Open report →
      </a>
    </main>
  )
}
