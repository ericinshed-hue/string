import { useState, type FormEvent } from 'react'

type Mode = 'encrypt' | 'unlock' | 'decrypt'

const TITLE: Record<Mode, string> = {
  encrypt: 'Encrypt',
  unlock: 'Unlock',
  decrypt: 'Decrypt'
}

export function PasswordDialog({
  mode,
  error,
  onCancel,
  onSubmit
}: {
  mode: Mode
  error: string
  onCancel: () => void
  onSubmit: (password: string) => void
}) {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [localError, setLocalError] = useState('')

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (!password) {
      setLocalError('Enter a password')
      return
    }
    if (mode === 'encrypt' && password !== again) {
      setLocalError('Passwords do not match')
      return
    }
    setLocalError('')
    onSubmit(password)
  }

  const message = localError || error

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form className="password-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}>
        <h2>{TITLE[mode]}</h2>
        <label className="field">
          <span>Password</span>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onCancel()
            }}
          />
        </label>
        {mode === 'encrypt' ? (
          <label className="field">
            <span>Confirm password</span>
            <input
              type="password"
              value={again}
              onChange={(event) => setAgain(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') onCancel()
              }}
            />
          </label>
        ) : null}
        {message ? <p className="field-hint">{message}</p> : null}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button className="primary" type="submit">{TITLE[mode]}</button>
        </div>
      </form>
    </div>
  )
}
