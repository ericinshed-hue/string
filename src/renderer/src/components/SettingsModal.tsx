import { useEffect, useState } from 'react'
import { EDITOR_FONTS, editorFontStack } from '@shared/fonts'
import { chordFromEvent, expandRule, SHORTCUT_LABELS } from '@shared/handbook'
import type { HandbookRule, ProfileInput, PublicProfile, PublicSettings, ShortcutBinding } from '@shared/types'

type Draft = ProfileInput

type Props = {
  settings: PublicSettings
  onClose: () => void
  onSaved: (settings: PublicSettings) => void
  onToast: (text: string) => void
  onCheckUpdates: () => void
}

export function SettingsModal({ settings, onClose, onSaved, onToast, onCheckUpdates }: Props) {
  const [profiles, setProfiles] = useState<Draft[]>(() => settings.profiles.map(toDraft))
  const [activeId, setActiveId] = useState(settings.activeProfileId)
  const [prompt, setPrompt] = useState(settings.systemPrompt)
  const [editorFont, setEditorFont] = useState(settings.editorFont)
  const [handbook, setHandbook] = useState<HandbookRule[]>(() => settings.handbook.map((rule) => ({ ...rule })))
  const [shortcuts, setShortcuts] = useState<ShortcutBinding[]>(() => settings.shortcuts.map((item) => ({ ...item })))
  const [recording, setRecording] = useState<ShortcutBinding['action'] | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!recording) return
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setRecording(null)
        return
      }
      const chord = chordFromEvent(event)
      if (!chord) return
      const taken = shortcuts.some((item) => item.action !== recording && item.chord === chord)
      if (taken) {
        onToast('That shortcut is already used')
        return
      }
      setShortcuts((current) => current.map((item) => (item.action === recording ? { ...item, chord } : item)))
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, shortcuts, onToast])

  async function chooseRoot(): Promise<void> {
    try {
      const next = await window.routine.pickRoot()
      if (next) {
        window.routine.rewatch()
        onSaved(next)
        onToast('Vault updated')
      }
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not choose a folder')
    }
  }

  async function save(): Promise<void> {
    try {
      await window.routine.saveProfiles(profiles, activeId, prompt)
      const next = await window.routine.saveEditor(handbook, shortcuts, editorFont)
      onSaved(next)
      onToast('Settings saved')
      onClose()
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not save')
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
        <h2>Settings</h2>
        <label className="field">
          <span>Vault</span>
          <div className="field-row">
            <code>{settings.vaultRoot ?? 'None selected'}</code>
            <button onClick={() => void chooseRoot()}>Change</button>
          </div>
        </label>
        <label className="field">
          <span>Note font</span>
          <select value={editorFont} onChange={(event) => setEditorFont(event.target.value)}>
            {EDITOR_FONTS.map((font) => (
              <option key={font} value={font} style={{ fontFamily: editorFontStack(font) }}>
                {font}
              </option>
            ))}
          </select>
          <p className="field-hint" style={{ fontFamily: editorFontStack(editorFont) }}>
            The quick brown fox jumps over the lazy dog.
          </p>
        </label>
        <div className="field">
          <span>API profiles</span>
          {profiles.map((profile) => (
            <div className={profile.id === activeId ? 'profile active' : 'profile'} key={profile.id}>
              <label className="check">
                <input
                  type="radio"
                  checked={profile.id === activeId}
                  onChange={() => setActiveId(profile.id)}
                />
                In use
              </label>
              <input
                value={profile.name}
                placeholder="Profile name"
                onChange={(event) => update(profile.id, { name: event.target.value })}
              />
              <input
                value={profile.baseURL}
                placeholder="https://api.openai.com/v1"
                onChange={(event) => update(profile.id, { baseURL: event.target.value })}
              />
              <input
                value={profile.model}
                placeholder="Model"
                onChange={(event) => update(profile.id, { model: event.target.value })}
              />
              <input
                type="password"
                value={profile.apiKey}
                placeholder={profile.keepKey ? 'Key saved. Leave blank to keep it' : 'API key'}
                onChange={(event) => update(profile.id, { apiKey: event.target.value, keepKey: false })}
              />
              <button onClick={() => remove(profile.id)}>Remove</button>
            </div>
          ))}
          <button
            onClick={() => {
              const id = crypto.randomUUID()
              setProfiles((current) => [
                ...current,
                { id, name: 'New profile', baseURL: 'https://api.openai.com/v1', model: '', apiKey: '', keepKey: false }
              ])
              setActiveId(id)
            }}
          >
            Add profile
          </button>
        </div>
        <div className="field">
          <span>Snippet book</span>
          <p className="field-hint">A trigger is replaced as soon as you finish typing it. Time and date use the current clock. Formats accept YYYY, MM, DD, HH, mm, and ss. A custom row replaces the trigger with the text you write.</p>
          {handbook.map((rule) => (
            <div className="rule-card" key={rule.id}>
              <div className="rule-head">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(event) => patchRule(rule.id, { enabled: event.target.checked })}
                  />
                  <span>{ruleLabel(rule.kind)}</span>
                </label>
                {rule.kind === 'text' ? (
                  <button onClick={() => setHandbook((current) => current.filter((item) => item.id !== rule.id))}>Delete</button>
                ) : null}
              </div>
              <div className="rule-fields">
                <label className="rule-field">
                  <span>Trigger</span>
                  <input
                    value={rule.trigger}
                    placeholder="e.g. ::hi"
                    onChange={(event) => patchRule(rule.id, { trigger: event.target.value })}
                  />
                </label>
                <label className="rule-field">
                  <span>{rule.kind === 'text' ? 'Output' : 'Format'}</span>
                  <input
                    value={rule.format}
                    placeholder={rule.kind === 'text' ? 'Replacement text' : ''}
                    onChange={(event) => patchRule(rule.id, { format: event.target.value })}
                  />
                </label>
              </div>
              <p className="rule-preview">Becomes {expandRule(rule, now) || '(empty)'}</p>
            </div>
          ))}
          <button
            onClick={() =>
              setHandbook((current) => [
                ...current,
                { id: crypto.randomUUID(), trigger: '', kind: 'text', format: '', enabled: true }
              ])
            }
          >
            Add snippet
          </button>
        </div>
        <div className="field">
          <span>Shortcuts</span>
          <p className="field-hint">These work in the note. Click a key, then press the new combination. Esc cancels.</p>
          {shortcuts.map((item) => (
            <div className="shortcut-row" key={item.action}>
              <span>{SHORTCUT_LABELS[item.action]}</span>
              <button
                className={recording === item.action ? 'chord on' : 'chord'}
                onClick={() => setRecording(recording === item.action ? null : item.action)}
              >
                {recording === item.action ? 'Press keys' : item.chord}
              </button>
            </div>
          ))}
        </div>
        <label className="field">
          <span>System prompt</span>
          <textarea value={prompt} rows={5} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <div className="modal-actions">
          <button onClick={onCheckUpdates}>Check for updates</button>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => void save()}>
            Save
          </button>
        </div>
      </div>
    </div>
  )

  function update(id: string, patch: Partial<Draft>): void {
    setProfiles((current) => current.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)))
  }

  function remove(id: string): void {
    setProfiles((current) => current.filter((profile) => profile.id !== id))
    if (activeId === id) setActiveId(null)
  }

  function patchRule(id: string, patch: Partial<HandbookRule>): void {
    setHandbook((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)))
  }
}

function ruleLabel(kind: HandbookRule['kind']): string {
  if (kind === 'time') return 'Current time'
  if (kind === 'date') return 'Today’s date'
  return 'Custom'
}

function toDraft(profile: PublicProfile): Draft {
  return {
    id: profile.id,
    name: profile.name,
    baseURL: profile.baseURL,
    model: profile.model,
    apiKey: '',
    keepKey: profile.hasKey
  }
}
