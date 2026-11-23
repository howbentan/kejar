/** The round flat/3D switch at the map's bottom right (cube while flat, flat layers while in 3D). */
export default function MapViewButton({ threeD, onToggle }: { threeD: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`view-btn${threeD ? ' on' : ''}`}
      onClick={onToggle}
      aria-label={threeD ? 'Show buildings flat' : 'Show buildings in 3D'}
    >
      {threeD ? (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4 3 9l9 5 9-5-9-5Z" />
          <path d="M3 14l9 5 9-5" opacity=".45" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" />
          <path d="M4 7.5 12 12l8-4.5M12 12v9" />
        </svg>
      )}
    </button>
  )
}
