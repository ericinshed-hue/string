import { useEffect, useRef } from 'react'
import Vditor from 'vditor'
import { chordFromEvent, expandRule, findTrigger } from '@shared/handbook'
import type { HandbookRule, ShortcutAction, ShortcutBinding, Zone } from '@shared/types'
import { imageVaultPath, vaultUrlFromPosix } from '@shared/url'

type Props = {
  zone: Zone
  filePath: string
  loadToken: number
  initialContent: string
  handbook: HandbookRule[]
  shortcuts: ShortcutBinding[]
  onChange: (value: string) => void
}

type VditorLive = {
  vditor?: {
    ir?: { element: HTMLElement }
    toolbar?: { elements: Record<string, HTMLElement | undefined> }
  }
}

export function EditorPane(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const vditorRef = useRef<Vditor | null>(null)
  const readyRef = useRef(false)
  const silentRef = useRef(false)
  const propsRef = useRef(props)
  const rulesRef = useRef(props.handbook)
  const shortcutsRef = useRef(props.shortcuts)
  propsRef.current = props
  rulesRef.current = props.handbook
  shortcutsRef.current = props.shortcuts

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    silentRef.current = true
    const night = props.zone === 'note'
    let cancelled = false
    let expanding = false
    let vditor: Vditor
    const onKey = (event: KeyboardEvent): void => {
      const chord = chordFromEvent(event)
      if (!chord) return
      const binding = shortcutsRef.current.find((item) => item.chord === chord)
      if (!binding) return
      const editor = (vditor as unknown as VditorLive).vditor?.ir?.element
      if (!editor || !editor.contains(event.target as Node)) return
      event.preventDefault()
      event.stopPropagation()
      runShortcut(vditor as unknown as VditorLive, binding.action)
    }
    const onInput = (event: Event): void => {
      if (expanding) return
      const input = event as InputEvent
      if (input.isComposing) return
      if (input.inputType && !['insertText', 'insertCompositionText', 'insertFromPaste'].includes(input.inputType)) return
      const editor = (vditor as unknown as VditorLive).vditor?.ir?.element
      if (!editor) return
      expanding = true
      try {
        expandAtCaret(editor, rulesRef.current)
      } finally {
        expanding = false
      }
    }
    vditor = new Vditor(host, {
      mode: 'ir',
      value: propsRef.current.initialContent,
      height: '100%',
      width: '100%',
      theme: night ? 'dark' : 'classic',
      lang: 'en_US',
      cdn: new URL('vditor/', window.location.href).href.replace(/\/$/, ''),
      cache: { enable: false },
      toolbar: [
        { name: 'bold', hotkey: '' },
        { name: 'italic', hotkey: '' },
        { name: 'headings', hotkey: '' }
      ],
      toolbarConfig: { hide: true },
      outline: { enable: false, position: 'left' },
      placeholder: night ? 'Write tonight’s diary' : 'Note what you did today',
      preview: {
        theme: { current: night ? 'dark' : 'light' },
        hljs: { style: night ? 'native' : 'github', lineNumber: false },
        math: { engine: 'KaTeX' },
        markdown: {
          toc: true,
          mark: true,
          footnotes: true,
          sanitize: false,
          autoSpace: true
        },
        transform: (html) => rewriteImages(html, propsRef.current.zone, propsRef.current.filePath)
      },
      upload: {
        accept: 'image/*',
        handler: (files) => {
          const task = uploadImages(files, propsRef.current, vditorRef.current)
          return task as Promise<string> | Promise<null>
        }
      },
      input: (value) => {
        if (silentRef.current) return
        propsRef.current.onChange(value)
      },
      after: () => {
        if (cancelled) return
        const editor = (vditor as unknown as VditorLive).vditor?.ir?.element
        if (editor) {
          editor.addEventListener('keydown', onKey, true)
          editor.addEventListener('input', onInput, true)
        }
        readyRef.current = true
        silentRef.current = true
        vditor.setValue(propsRef.current.initialContent)
        silentRef.current = false
      }
    })
    vditorRef.current = vditor
    return () => {
      cancelled = true
      readyRef.current = false
      vditorRef.current = null
      const editor = (vditor as unknown as VditorLive).vditor?.ir?.element
      editor?.removeEventListener('keydown', onKey, true)
      editor?.removeEventListener('input', onInput, true)
      const live = vditor as unknown as { vditor?: unknown; isDestroyed: boolean; destroy: () => void }
      if (live.vditor) live.destroy()
      else live.isDestroyed = true
    }
  }, [props.filePath, props.zone])

  useEffect(() => {
    const vditor = vditorRef.current
    if (!vditor || !readyRef.current) return
    silentRef.current = true
    vditor.setValue(props.initialContent)
    silentRef.current = false
  }, [props.loadToken, props.initialContent])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const fix = (): void => {
      host.querySelectorAll('img').forEach((img) => {
        const raw = img.getAttribute('data-raw-src') || img.getAttribute('src') || ''
        if (!raw || /^(?:vault:|data:|blob:|https?:)/.test(raw)) return
        const vaultPath = imageVaultPath(props.zone, props.filePath, raw)
        if (!vaultPath) return
        const next = vaultUrlFromPosix(vaultPath)
        if (img.getAttribute('src') !== next) {
          img.setAttribute('data-raw-src', raw)
          img.setAttribute('src', next)
        }
      })
    }
    const observer = new MutationObserver(fix)
    observer.observe(host, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })
    fix()
    return () => observer.disconnect()
  }, [props.zone, props.filePath, props.loadToken])

  return <div className="editor-host" ref={hostRef} />
}

async function uploadImages(
  files: File[],
  current: { zone: Zone; filePath: string },
  editor: Vditor | null
): Promise<string | null> {
  if (!current || !editor) return 'The editor is not ready'
  try {
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const rel = await window.routine.saveImage(current.zone, current.filePath, file.name, bytes)
      const alt = file.name.replace(/[[\]]/g, '')
      editor.insertValue(`\n![${alt}](${rel})\n`)
    }
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Could not save the image'
  }
}

function expandAtCaret(editor: HTMLElement, rules: HandbookRule[]): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer) || insideLockedBlock(range.startContainer, editor)) return
  const spot = caretText(range)
  if (!spot) return
  const text = spot.node.textContent ?? ''
  const before = text.slice(0, spot.offset)
  const hit = findTrigger(before, rules)
  if (!hit) return
  const value = expandRule(hit.rule)
  spot.node.textContent = text.slice(0, hit.start) + value + text.slice(spot.offset)
  const caret = hit.start + value.length
  const next = document.createRange()
  next.setStart(spot.node, Math.min(caret, spot.node.textContent.length))
  next.collapse(true)
  selection.removeAllRanges()
  selection.addRange(next)
}

function caretText(range: Range): { node: Text; offset: number } | null {
  const container = range.startContainer
  if (container.nodeType === Node.TEXT_NODE) return { node: container as Text, offset: range.startOffset }
  if (container.nodeType === Node.ELEMENT_NODE && range.startOffset > 0) {
    const prev = container.childNodes[range.startOffset - 1]
    if (prev?.nodeType === Node.TEXT_NODE) return { node: prev as Text, offset: prev.textContent?.length ?? 0 }
  }
  return null
}

function insideLockedBlock(node: Node, editor: HTMLElement): boolean {
  let current = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
  while (current && current !== editor) {
    const type = current.getAttribute('data-type')
    if (type === 'code-block' || type === 'code' || type === 'math-block' || type === 'html-block') return true
    if (current.classList.contains('vditor-ir__preview')) return true
    current = current.parentElement
  }
  return false
}

function runShortcut(live: VditorLive, action: ShortcutAction): void {
  const elements = live.vditor?.toolbar?.elements
  if (!elements) return
  if (action === 'bold' || action === 'italic') {
    elements[action]?.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return
  }
  const level = action.slice(1)
  elements.headings?.querySelector(`button[data-tag="h${level}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function rewriteImages(html: string, zone: Zone, filePath: string): string {
  return html.replace(/(<img\b[^>]*?\ssrc=")([^"]+)(")/g, (full, prefix, src, suffix) => {
    const vaultPath = imageVaultPath(zone, filePath, src)
    if (!vaultPath) return full
    return `${prefix}${vaultUrlFromPosix(vaultPath)}${suffix}`
  })
}
