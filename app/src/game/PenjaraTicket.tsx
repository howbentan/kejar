import { wallClock } from './time'

/**
 * The Penjara entry pass (Malaysian touches pass, `docs/superpowers/specs/2026-11-03-kejar-penjara-toll-ticket-design.md`):
 * a toll/parking plaza entry ticket. The metaphor matches the real mechanic on purpose -- ticketed on entry,
 * carried to an exit gate (Penjara) to be cleared (Settle). Shared between `Caught` and `AutoJailed` in Jail.tsx;
 * only the fields that are genuinely different between the two ways in differ (§5 of the design doc).
 */

/** A small pool of numbers that mean something to a Malaysian player on sight, not a sequential id (design doc §7.1). */
const TICKET_NUMBERS = ['19570831', '67676767', '19630916']

/** Same deterministic-hash-into-a-list pattern `Jail.tsx` already uses for its caught/missed lines (design doc §7.1). */
function pick<T>(list: T[], id: string): T {
  const h = [...id].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0)
  return list[h % list.length]
}

type Variant =
  | { kind: 'catch'; caughtBy: string; caughtAtMs: number | null }
  | { kind: 'auto'; lastSeenMs: number | null }

export default function PenjaraTicket({
  playerId,
  variant,
  distanceM,
  outForGood,
  settled,
}: {
  /** Seeds which easter-egg number this player's ticket shows (stable for them, not random per render). */
  playerId: string
  variant: Variant
  /** Live metres to the gate from `WalkGuide`'s `onDistance`, or null before a fix / when lost. */
  distanceM: number | null
  /** Already used their one escape and got caught again: there is no gate left to clear this round (design doc §5). */
  outForGood: boolean
  /** Settle just resolved for this player: shows the SETTLE stamp and flips STATUS to FREE. */
  settled: boolean
}) {
  const number = pick(TICKET_NUMBERS, playerId)
  const status = settled ? 'FREE' : outForGood ? 'HABIS · TIADA KELUARAN' : variant.kind === 'catch' ? 'BELUM BAYAR' : 'SESSION TIMED OUT'
  const statusEcho = settled ? 'bebas' : outForGood ? 'no further exit this round' : variant.kind === 'catch' ? 'unpaid, walk to the gate' : 'tempoh tamat, jalan ke gerbang'

  return (
    <div className="toll-ticket">
      <div className="toll-ticket-strip" aria-hidden="true" />
      <div className="toll-ticket-head">
        <div>
          <p className="toll-ticket-brand">kejar. plaza tol</p>
          <p className="toll-ticket-kind mono">TIKET MASUK</p>
          <p className="toll-ticket-echo">entry ticket</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p className="toll-ticket-label mono">GERBANG</p>
          <p className="toll-ticket-gate">PENJARA</p>
        </div>
      </div>

      <p className="toll-ticket-number">{number}</p>

      <div className="toll-ticket-fields">
        {variant.kind === 'catch' ? (
          <>
            <Field label="MASUK" value={variant.caughtAtMs !== null ? wallClock(variant.caughtAtMs) : '-'} />
            <Field label="JARAK KE GERBANG" value={distanceM !== null ? `${Math.round(distanceM / 10) * 10} M` : '-'} />
          </>
        ) : (
          <>
            <Field label="LAST SEEN" value={variant.lastSeenMs !== null ? wallClock(variant.lastSeenMs) : '-'} />
            <Field label="DISTANCE TO GATE" value={distanceM !== null ? `${Math.round(distanceM / 10) * 10} M` : '-'} />
          </>
        )}
      </div>

      <div className="toll-ticket-status">
        <p className="toll-ticket-label mono">STATUS</p>
        <p className="toll-ticket-status-value">{status}</p>
        <p className="toll-ticket-echo" style={{ textAlign: 'right' }}>
          {statusEcho}
        </p>
      </div>

      <p className="toll-ticket-footer mono">
        {variant.kind === 'catch' ? '*** SIMPAN TIKET INI UNTUK KELUAR ***' : '*** PHONE PROBLEM? ASK A MARSHAL ***'}
      </p>
      {variant.kind === 'catch' && <p className="toll-ticket-echo" style={{ textAlign: 'center' }}>keep this ticket to exit</p>}

      <Barcode />

      {settled && <span className="toll-ticket-stamp">SETTLE</span>}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="toll-ticket-label mono">{label}</p>
      <p className="toll-ticket-value">{value}</p>
    </div>
  )
}

/**
 * Uniform-height bars, varying only in width, packed densely edge to edge -- not a height-varying "equaliser"
 * and not evenly spaced apart (design doc §5). Each bar's width is a flex-grow weight, not a fixed pixel size,
 * so the bars themselves fill the ticket's full printable width; the only gap is the fixed, tight one between them.
 */
function Barcode() {
  const weights = [2, 1, 3, 1, 2, 1, 2, 3, 1, 2, 1, 2, 1, 3, 1, 2, 1, 3, 2, 1]
  return (
    <div className="toll-ticket-barcode" aria-hidden="true">
      {weights.map((w, i) => (
        <span key={i} style={{ flex: w }} />
      ))}
    </div>
  )
}
