import { routeFor } from './routes'
import { MotionRoot } from './game/motion'
import { Screen } from './game/ui'
import GameScreen from './screens/GameScreen'
import Home from './screens/Home'
import HostLobby from './screens/HostLobby'
import HostNew from './screens/HostNew'
import Join from './screens/Join'
import MarshalRedeem from './screens/MarshalRedeem'
import OrganiserRedeem from './screens/OrganiserRedeem'
import { parsePrintCardHash } from './game/printLinks'
import PrintCard from './screens/PrintCard'
import YourKit from './screens/YourKit'
import { HostWalk } from './screens/WalkPark'
import PrintTags from './screens/PrintTags'

export default function App() {
  return (
    <MotionRoot>
      <Routed />
    </MotionRoot>
  )
}

function Routed() {
  const { route, code, token } = routeFor(window.location.pathname)
  switch (route) {
    case 'home':
      return <Home />
    case 'host-new':
      return <HostNew />
    case 'host-kit':
      return <YourKit />
    case 'host-lobby':
      return <HostLobby code={code!} />
    case 'host-walk':
      return <HostWalk code={code!} />
    case 'join':
      return <Join code={code!} />
    case 'game':
      return <GameScreen code={code!} />
    case 'print-tags':
      return <PrintTags />
    case 'print-card':
      const printed = parsePrintCardHash(window.location.hash)
      return <PrintCard cardCode={printed.code} legendary={printed.legendary} />
    case 'organiser-redeem':
      return <OrganiserRedeem token={token!} />
    case 'marshal-redeem':
      return <MarshalRedeem code={code!} token={token!} />
    default:
      return <Screen eyebrow="Not found">{null}</Screen>
  }
}
