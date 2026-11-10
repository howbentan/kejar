/** The five-segment progress bar of the organiser's setup: the current step and those before it are filled. */
export default function SetupSteps({ step }: { step: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div role="img" aria-label={`Step ${step} of 5`} style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i
          key={n}
          className={n <= step ? 'on' : undefined}
          style={{ flex: 1, height: 4, borderRadius: 2, background: n <= step ? 'var(--volt)' : '#2a2a2a' }}
        />
      ))}
    </div>
  )
}
