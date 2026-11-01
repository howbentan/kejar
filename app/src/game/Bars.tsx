import * as m from 'motion/react-m'

/** Five white prison bars dropping from the top in quick succession (motion design §5). */
export default function Bars() {
  return (
    <div className="bars" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <m.span
          key={i}
          style={{ left: `${10 + i * 20}%` }}
          initial={{ y: '-100%' }}
          animate={{ y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.3, ease: [0.34, 1.3, 0.64, 1] }}
        />
      ))}
    </div>
  )
}
