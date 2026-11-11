import type { SceneId } from '../../../shared/howToPlay.js'
import type { PowerUpKind } from '../../../shared/types.js'

/** Placeholder until the drawn scenes land: a framed box keyed by scene id. */
export function Scene({ id, stickers }: { id: SceneId; stickers?: PowerUpKind[] }) {
  return (
    <div
      data-scene={id}
      data-stickers={stickers?.join(',')}
      style={{ width: 220, height: 220, border: '2px dashed var(--volt)', borderRadius: 16, opacity: 0.4 }}
    />
  )
}

export default Scene
