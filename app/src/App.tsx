import { routeFor } from './routes'
import SpikeAdmin from './spike/SpikeAdmin'
import SpikeJoin from './spike/SpikeJoin'
import SpikeReport from './spike/SpikeReport'

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
      return <SpikeJoin />
    case 'spike-admin':
      return <SpikeAdmin />
    case 'spike-report':
      return <SpikeReport />
    default:
      return <Placeholder title="Not found" />
  }
}
