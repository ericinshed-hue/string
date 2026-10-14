import { useEffect, useState } from 'react'
import { EDITOR_FONTS, UI_FONT_SIZES, editorFontStack } from '@shared/fonts'
import { chordFromEvent, expandRule, SHORTCUT_LABELS } from '@shared/handbook'
import type { HandbookRule, ProfileInput, PublicProfile, PublicSettings, ShortcutBinding, Skill, UsageStats } from '@shared/types'

type Page = 'vault' | 'font' | 'appfont' | 'api' | 'usage' | 'account' | 'snippets' | 'shortcuts' | 'prompt' | 'skills'

const PAGES: Array<{ id: Page; label: string; title: string }> = [
  { id: 'vault', label: 'Vault', title: 'Vault' },
  { id: 'font', label: 'Note font', title: 'Note font' },
  { id: 'appfont', label: 'App font', title: 'App font' },
  { id: 'api', label: 'API', title: 'API' },
  { id: 'usage', label: 'API usage', title: 'API usage' },
  { id: 'account', label: 'Account', title: 'Account' },
  { id: 'snippets', label: 'Snippets', title: 'Snippets' },
  { id: 'shortcuts', label: 'Shortcuts', title: 'Shortcuts' },
  { id: 'prompt', label: 'System prompt', title: 'System prompt' },
  { id: 'skills', label: 'Skills', title: 'Skills' }
]

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
  const [uiFont, setUiFont] = useState(settings.uiFont)
  const [uiFontSize, setUiFontSize] = useState(settings.uiFontSize)
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [handbook, setHandbook] = useState<HandbookRule[]>(() => settings.handbook.map((rule) => ({ ...rule })))
  const [shortcuts, setShortcuts] = useState<ShortcutBinding[]>(() => settings.shortcuts.map((item) => ({ ...item })))
  const [skills, setSkills] = useState<Skill[]>(() => (settings.skills ?? []).map((skill) => ({ ...skill })))
  const [page, setPage] = useState<Page>('vault')
  const [recording, setRecording] = useState<ShortcutBinding['action'] | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (page !== 'usage') return
    void window.routine.usage().then(setUsage).catch(() => setUsage(null))
  }, [page])

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

  async function addFolder(): Promise<void> {
    try {
      const next = await window.routine.addLibrary()
      if (next) {
        window.routine.rewatch()
        onSaved(next)
        onToast('Folder added')
      }
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not add a folder')
    }
  }

  async function removeFolder(folder: string): Promise<void> {
    try {
      const next = await window.routine.removeLibrary(folder)
      window.routine.rewatch()
      onSaved(next)
      onToast('Folder removed')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not remove that folder')
    }
  }

  async function save(): Promise<void> {
    try {
      await window.routine.saveProfiles(profiles, activeId, prompt)
      const next = await window.routine.saveEditor(handbook, shortcuts, editorFont, uiFont, uiFontSize, skills)
      onSaved(next)
      onToast('Settings saved')
      onClose()
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not save')
    }
  }

  const current = PAGES.find((item) => item.id === page) ?? PAGES[0]

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
        <nav className="settings-nav">
          <button className="settings-close" onClick={onClose} aria-label="Close">×</button>
          {PAGES.map((item) => (
            <button
              key={item.id}
              className={item.id === page ? 'on' : ''}
              onClick={() => setPage(item.id)}
            >
              <NavIcon id={item.id} />
              {item.label}
            </button>
          ))}
          <button className="settings-nav-updates" onClick={onCheckUpdates}>
            <NavIcon id="updates" />
            Check for updates
          </button>
        </nav>
        <div className="settings-main">
          <div className="settings-page">
            <h2>{current.title}</h2>
            {page === 'vault' ? (
              <>
                <div className="setting-row">
                  <div>
                    <strong>Folders</strong>
                    <p>Day and Night share this list. Each folder’s contents appear together.</p>
                  </div>
                  <button onClick={() => void addFolder()}>Add</button>
                </div>
                {(settings.libraries ?? []).map((folder) => (
                  <div className="setting-row" key={folder}>
                    <p className="setting-path">{folder}</p>
                    <button onClick={() => void removeFolder(folder)}>Remove</button>
                  </div>
                ))}
              </>
            ) : null}
            {page === 'font' ? (
              <div className="setting-row">
                <div>
                  <strong>Editor font</strong>
                  <p style={{ fontFamily: editorFontStack(editorFont) }}>The quick brown fox jumps over the lazy dog.</p>
                </div>
                <select value={editorFont} onChange={(event) => setEditorFont(event.target.value)}>
                  {EDITOR_FONTS.map((font) => (
                    <option key={font} value={font} style={{ fontFamily: editorFontStack(font) }}>
                      {font}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {page === 'appfont' ? (
              <>
                <div className="setting-row">
                  <div>
                    <strong>Font</strong>
                    <p style={{ fontFamily: editorFontStack(uiFont) }}>Buttons, menus, and this window.</p>
                  </div>
                  <select value={uiFont} onChange={(event) => setUiFont(event.target.value)}>
                    {EDITOR_FONTS.map((font) => (
                      <option key={font} value={font} style={{ fontFamily: editorFontStack(font) }}>{font}</option>
                    ))}
                  </select>
                </div>
                <div className="setting-row">
                  <div>
                    <strong>Size</strong>
                    <p>Does not change the note text.</p>
                  </div>
                  <select value={uiFontSize} onChange={(event) => setUiFontSize(Number(event.target.value))}>
                    {UI_FONT_SIZES.map((size) => (
                      <option key={size} value={size}>{size} px</option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}
            {page === 'usage' ? (
              <>
                <p className="field-hint">Counted on this computer after each assistant request. Some APIs omit token counts.</p>
                <div className="setting-row"><div><strong>Requests</strong></div><span>{usage?.requests ?? 0}</span></div>
                <div className="setting-row"><div><strong>Prompt tokens</strong></div><span>{usage?.promptTokens ?? 0}</span></div>
                <div className="setting-row"><div><strong>Completion tokens</strong></div><span>{usage?.completionTokens ?? 0}</span></div>
                <div className="setting-row"><div><strong>Total tokens</strong></div><span>{(usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0)}</span></div>
                <div className="setting-row"><div><strong>Last request</strong></div><span>{usage?.updatedAt ? new Date(usage.updatedAt).toLocaleString() : 'None yet'}</span></div>
              </>
            ) : null}
            {page === 'account' ? (
              settings.account ? (
                <>
                  <div className="setting-row"><div><strong>Name</strong></div><span>{settings.account.name}</span></div>
                  <div className="setting-row"><div><strong>Email</strong></div><span>{settings.account.email}</span></div>
                  <div className="setting-row"><div><strong>Expires</strong></div><span>{settings.account.exp ?? 'No expiry'}</span></div>
                  <div className="setting-row"><div><strong>Version</strong></div><span>{settings.version}</span></div>
                </>
              ) : (
                <>
                  <p className="field-hint">This copy has no activation record. A packaged install asks for a code on first launch.</p>
                  <div className="setting-row"><div><strong>Version</strong></div><span>{settings.version}</span></div>
                </>
              )
            ) : null}
            {page === 'api' ? (
        <div className="field">
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
            ) : null}
            {page === 'snippets' ? (
        <div className="field">
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
            ) : null}
            {page === 'shortcuts' ? (
        <div className="field">
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
            ) : null}
            {page === 'prompt' ? (
              <label className="field">
                <textarea value={prompt} rows={8} onChange={(event) => setPrompt(event.target.value)} />
              </label>
            ) : null}
            {page === 'skills' ? (
              <div className="field">
                <p className="field-hint">Type \name in the assistant. The chat still shows your words. The instructions go with that message only.</p>
                {skills.map((skill) => (
                  <div className="rule-card" key={skill.id}>
                    <div className="rule-head">
                      <label className="rule-field">
                        <span>Name</span>
                        <input
                          value={skill.name}
                          placeholder="review"
                          onChange={(event) => patchSkill(skill.id, { name: event.target.value })}
                        />
                      </label>
                      <button onClick={() => setSkills((items) => items.filter((item) => item.id !== skill.id))}>Delete</button>
                    </div>
                    <textarea
                      value={skill.instructions}
                      rows={4}
                      placeholder="Tell the assistant how to handle this request."
                      onChange={(event) => patchSkill(skill.id, { instructions: event.target.value })}
                    />
                  </div>
                ))}
                <button
                  onClick={() =>
                    setSkills((items) => [...items, { id: crypto.randomUUID(), name: '', instructions: '' }])
                  }
                >
                  Add skill
                </button>
              </div>
            ) : null}
          </div>
          <div className="modal-actions">
            <button className="primary" onClick={() => void save()}>Save</button>
          </div>
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

  function patchSkill(id: string, patch: Partial<Skill>): void {
    setSkills((items) => items.map((skill) => (skill.id === id ? { ...skill, ...patch } : skill)))
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

function NavIcon({ id }: { id: Page | 'updates' }) {
  const common = {
    className: 'settings-nav-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.15,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  }
  if (id === 'appfont') {
    return (
      <svg {...common}>
        <path d="M4 6h16M4 12h10M4 18h16" />
      </svg>
    )
  }
  if (id === 'usage') {
    return (
      <svg {...common}>
        <path d="M5 19V10M12 19V5M19 19v-7" />
      </svg>
    )
  }
  if (id === 'account') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 19c1.4-3 3.6-4.5 6.5-4.5s5.1 1.5 6.5 4.5" />
      </svg>
    )
  }
  if (id === 'vault') {
    return (
      <svg {...common}>
        <path d="M4 8.5h16v10.5H4z" />
        <path d="M4 8.5l2.2-3h5.2l1.4 2" />
      </svg>
    )
  }
  if (id === 'font') {
    return (
      <svg {...common}>
        <path d="M5 19L12 5l7 14" />
        <path d="M8.2 14h7.6" />
      </svg>
    )
  }
  if (id === 'api') {
    return (
      <svg {...common}>
        <circle cx="7" cy="12" r="2.2" />
        <circle cx="17" cy="8" r="2.2" />
        <circle cx="17" cy="16" r="2.2" />
        <path d="M9.1 11.2l5.6-2.4M9.1 12.8l5.6 2.4" />
      </svg>
    )
  }
  if (id === 'snippets') {
    return (
      <svg {...common}>
        <path d="M9 7L4.5 12 9 17" />
        <path d="M15 7l4.5 5L15 17" />
      </svg>
    )
  }
  if (id === 'shortcuts') {
    return (
      <svg {...common}>
        <rect x="3.5" y="7" width="17" height="11" rx="2" />
        <path d="M7 11h.01M11 11h.01M15 11h.01M8 14.5h8" />
      </svg>
    )
  }
  if (id === 'prompt') {
    return (
      <svg {...common}>
        <path d="M5 6.5h14v8.5H9l-4 3.2z" />
      </svg>
    )
  }
  if (id === 'skills') {
    return (
      <svg {...common}>
        <path d="M12 3.2l1.5 4.6L18.2 9.2l-4.7 1.4L12 15.2l-1.5-4.6L5.8 9.2l4.7-1.4z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4.5V9h-4.5" />
    </svg>
  )
}
