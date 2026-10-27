import { routeFor } from './routes'
import { Screen } from './game/ui'
import GameScreen from './screens/GameScreen'
import Home from './screens/Home'
import HostLobby from './screens/HostLobby'
import HostNew from './screens/HostNew'
import Join from './screens/Join'
import OrganiserRedeem from './screens/OrganiserRedeem'
import PrintTags from './screens/PrintTags'
import SpikeAdmin from './spike/SpikeAdmin'
import SpikeJoin from './spike/SpikeJoin'
import SpikeReport from './spike/SpikeReport'

export default function App() {
  const { route, code, token } = routeFor(window.location.pathname)
  switch (route) {
    case 'home':
      return <Home />
    case 'host-new':
      return <HostNew />
    case 'host-lobby':
      return <HostLobby code={code!} />
    case 'join':
      return <Join code={code!} />
    case 'game':
      return <GameScreen code={code!} />
    case 'print-tags':
      return <PrintTags />
    case 'organiser-redeem':
      return <OrganiserRedeem token={token!} />
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
