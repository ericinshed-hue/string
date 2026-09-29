import type { Zone } from '@shared/types'

type Props = {
  zone: Zone
  onChange: (zone: Zone) => void
}

export function ZoneSwitch({ zone, onChange }: Props) {
  const startX = { current: 0 }

  return (
    <button
      className="zone-switch"
      data-zone={zone}
      role="switch"
      aria-checked={zone === 'note'}
      aria-label={zone === 'note' ? 'Night diary' : 'Day log'}
      onPointerDown={(event) => {
        startX.current = event.clientX
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerUp={(event) => {
        const delta = event.clientX - startX.current
        if (Math.abs(delta) < 8) onChange(zone === 'routine' ? 'note' : 'routine')
        else onChange(delta > 0 ? 'note' : 'routine')
      }}
    >
      <span className="zone-switch-label">Day</span>
      <span className="zone-switch-thumb" />
      <span className="zone-switch-label night">Night</span>
    </button>
  )
}
