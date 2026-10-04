import { useState } from 'react'
import type { PublicSettings } from '@shared/types'

type Props = {
  settings: PublicSettings
  onReady: (settings: PublicSettings) => void
  onToast: (text: string) => void
}

const STEPS = ['Notes folder', 'API', 'Activation code']

export function SetupWizard({ settings, onReady, onToast }: Props) {
  const existing = settings.profiles[0]
  const [step, setStep] = useState(0)
  const [vault, setVault] = useState(settings.vaultRoot ?? '')
  const [name, setName] = useState(existing?.name ?? 'Default')
  const [baseURL, setBaseURL] = useState(existing?.baseURL ?? 'https://api.openai.com/v1')
  const [model, setModel] = useState(existing?.model ?? '')
  const [apiKey, setApiKey] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function chooseFolder(): Promise<void> {
    try {
      const next = await window.routine.pickRoot()
      if (!next?.vaultRoot) return
      setVault(next.vaultRoot)
      onReady(next)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not choose a folder')
    }
  }

  async function saveApi(): Promise<void> {
    if (!baseURL.trim() || !model.trim() || (!apiKey.trim() && !existing?.hasKey)) {
      onToast('Enter an API URL, model, and key')
      return
    }
    setBusy(true)
    try {
      const id = existing?.id ?? crypto.randomUUID()
      const next = await window.routine.saveProfiles(
        [{
          id,
          name: name.trim() || 'Default',
          baseURL: baseURL.trim(),
          model: model.trim(),
          apiKey: apiKey.trim(),
          keepKey: !apiKey.trim() && Boolean(existing?.hasKey)
        }],
        id,
        settings.systemPrompt
      )
      onReady(next)
      setStep(2)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not save the API')
    } finally {
      setBusy(false)
    }
  }

  async function activate(): Promise<void> {
    if (!code.trim()) {
      onToast('Paste an activation code')
      return
    }
    setBusy(true)
    try {
      const next = await window.routine.activate(code.trim())
      onReady(next)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'That activation code is invalid')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-card setup-card">
        <p className="eyebrow">String</p>
        <h1>{STEPS[step]}</h1>
        <p className="setup-steps">{STEPS.map((label, index) => (index === step ? label : '·')).join('  ')}</p>
        {step === 0 ? (
          <>
            <p className="welcome-copy">Choose the folder that will hold your Note and Routine notebooks.</p>
            <p className="field-hint">{vault || 'No folder selected'}</p>
            <div className="welcome-actions">
              <button onClick={() => void chooseFolder()}>Choose folder</button>
              <button className="primary" disabled={!vault} onClick={() => setStep(1)}>Continue</button>
            </div>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <p className="welcome-copy">This is the OpenAI-compatible API the assistant will use.</p>
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span>API URL</span>
              <input value={baseURL} onChange={(event) => setBaseURL(event.target.value)} />
            </label>
            <label className="field">
              <span>Model</span>
              <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model" />
            </label>
            <label className="field">
              <span>API key</span>
              <input
                type="password"
                value={apiKey}
                placeholder={existing?.hasKey ? 'Key saved. Leave blank to keep it' : 'API key'}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
            <div className="welcome-actions">
              <button onClick={() => setStep(0)} disabled={busy}>Back</button>
              <button className="primary" disabled={busy} onClick={() => void saveApi()}>Continue</button>
            </div>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <p className="welcome-copy">Paste the activation code you were given. It is checked on this computer.</p>
            <label className="field">
              <span>Activation code</span>
              <textarea value={code} rows={4} onChange={(event) => setCode(event.target.value)} />
            </label>
            <div className="welcome-actions">
              <button onClick={() => setStep(1)} disabled={busy}>Back</button>
              <button className="primary" disabled={busy} onClick={() => void activate()}>Activate</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
