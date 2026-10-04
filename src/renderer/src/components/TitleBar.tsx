import type { Zone } from '@shared/types'
import { IconFiles, IconSearch, IconSettings, IconSpark } from './Icons'
import { ZoneSwitch } from './ZoneSwitch'

type Props = {
  zone: Zone
  treeOpen: boolean
  drawerOpen: boolean
  onToggleTree: () => void
  onSearch: () => void
  onToggleDrawer: () => void
  onSettings: () => void
  onZone: (zone: Zone) => void
}

export function TitleBar(props: Props) {
  return (
    <header className="titlebar">
      <div className="titlebar-group">
        <img className="app-mark" src={new URL('icon.png', window.location.href).href} alt="String" />
        <button className={props.treeOpen ? 'icon-btn on' : 'icon-btn'} onClick={props.onToggleTree} title="Files" aria-label="Files">
          <IconFiles />
        </button>
        <button className="icon-btn" onClick={props.onSearch} title="Search" aria-label="Search">
          <IconSearch />
        </button>
      </div>
      <ZoneSwitch zone={props.zone} onChange={props.onZone} />
      <div className="titlebar-group right">
        <button className={props.drawerOpen ? 'icon-btn on' : 'icon-btn'} onClick={props.onToggleDrawer} title="Assistant" aria-label="Assistant">
          <IconSpark />
        </button>
        <button className="icon-btn" onClick={props.onSettings} title="Settings" aria-label="Settings">
          <IconSettings />
        </button>
        <span className="title-gap" />
        <button className="win-btn" onClick={() => void window.routine.minimize()} aria-label="Minimize">
          –
        </button>
        <button className="win-btn" onClick={() => void window.routine.maximize()} aria-label="Maximize">
          □
        </button>
        <button className="win-btn close" onClick={() => void window.routine.close()} aria-label="Close">
          ×
        </button>
      </div>
    </header>
  )
}
