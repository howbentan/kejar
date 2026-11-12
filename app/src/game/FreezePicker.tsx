/**
 * Cheese Ais's chooser (new power-ups design §5.1): one button per Kejar whose slot can be frozen. Picking one
 * sends the freeze; Cancel keeps the card. Presentational only: PowerUpHand owns the API call.
 */
export default function FreezePicker({
  targets,
  onPick,
  onCancel,
}: {
  targets: { id: string; name: string }[]
  onPick: (id: string) => void
  onCancel: () => void
}) {
  const title = 'Freeze which Kejar?'
  return (
    <div className="moment grab" role="dialog" aria-modal="true" aria-label={title}>
      <h2 className="grab-title">{title}</h2>
      <p className="muted">Their power-up slot freezes for 3 minutes.</p>
      {targets.map((t) => (
        <button key={t.id} type="button" className="btn" onClick={() => onPick(t.id)}>
          {t.name}
        </button>
      ))}
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
