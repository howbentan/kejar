import { routeFor } from './routes'

function Home() {
  return (
    <main className="screen">
      <h1 className="wordmark">
        <span>kejar</span>
        <span style={{ color: 'var(--volt)' }}>.</span>
      </h1>
      <p className="muted">Real-life chase, refereed by your phone.</p>
    </main>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <main className="screen">
      <p className="eyebrow">{title}</p>
    </main>
  )
}

export default function App() {
  switch (routeFor(window.location.pathname)) {
    case 'home':
      return <Home />
    case 'spike-join':
      return <Placeholder title="Ping test" />
    case 'spike-admin':
      return <Placeholder title="Ping test · admin" />
    case 'spike-report':
      return <Placeholder title="Ping test · report" />
    default:
      return <Placeholder title="Not found" />
  }
}
