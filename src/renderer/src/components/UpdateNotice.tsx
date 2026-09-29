type Props = {
  phase: 'available' | 'downloading' | 'ready'
  version: string
  notes: string
  percent: number
  onLater: () => void
  onDownload: () => void
  onInstall: () => void
}

export function UpdateNotice(props: Props) {
  const title = props.phase === 'ready' ? 'Ready to install' : `String ${props.version}`
  return (
    <div className="modal-backdrop">
      <div className="password-modal" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p className="field-hint">
          {props.phase === 'ready'
            ? 'The update is downloaded. String will restart to finish installing.'
            : 'A new version is available.'}
        </p>
        {props.notes ? <p className="field-hint">{props.notes}</p> : null}
        {props.phase === 'downloading' ? <p className="field-hint">{Math.round(props.percent)}%</p> : null}
        <div className="modal-actions">
          {props.phase === 'ready' ? (
            <button className="primary" onClick={props.onInstall}>Restart and install</button>
          ) : (
            <>
              <button onClick={props.onLater} disabled={props.phase === 'downloading'}>Later</button>
              <button className="primary" onClick={props.onDownload} disabled={props.phase === 'downloading'}>
                Download
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
