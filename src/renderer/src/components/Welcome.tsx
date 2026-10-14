import type { PublicSettings } from '@shared/types'

type Props = {
  settings: PublicSettings
  onReady: (settings: PublicSettings) => void
  onToast: (text: string) => void
}

export function Welcome({ settings, onReady, onToast }: Props) {
  async function pick(): Promise<void> {
    try {
      const next = await window.routine.pickRoot()
      if (next) {
        window.routine.rewatch()
        onReady(next)
      }
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not choose a folder')
    }
  }

  async function useSample(): Promise<void> {
    try {
      const next = await window.routine.useSuggested()
      window.routine.rewatch()
      onReady(next)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Sample vault is unavailable')
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <p className="eyebrow">String</p>
        <h1>A day log, and a night diary</h1>
        <p className="welcome-copy">
          Choose a folder of notes. Day and Night share the same files; the title-bar switch only changes the theme and which side the assistant is on.
        </p>
        <div className="welcome-actions">
          <button className="primary" onClick={() => void pick()}>
            Choose folder
          </button>
          {settings.suggestedVault ? (
            <button onClick={() => void useSample()}>Use sample vault</button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
