import { routeFor } from './routes'
import { Screen } from './game/ui'
import Home from './screens/Home'
import HostLobby from './screens/HostLobby'
import HostNew from './screens/HostNew'
import PrintTags from './screens/PrintTags'
import SpikeAdmin from './spike/SpikeAdmin'
import SpikeJoin from './spike/SpikeJoin'
import SpikeReport from './spike/SpikeReport'

export default function App() {
  const { route, code } = routeFor(window.location.pathname)
  switch (route) {
    case 'home':
      return <Home />
    case 'host-new':
      return <HostNew />
    case 'host-lobby':
      return <HostLobby code={code!} />
    case 'print-tags':
      return <PrintTags />
    case 'spike-join':
      return <SpikeJoin />
    case 'spike-admin':
      return <SpikeAdmin />
    case 'spike-report':
      return <SpikeReport />
    default:
      return <Screen eyebrow="Not found">{null}</Screen>
  }
}
