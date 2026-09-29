import type { ReactNode } from 'react'

type Props = { className?: string }

function Glyph({ className, children }: Props & { children: ReactNode }) {
  return (
    <svg className={className ?? 'glyph'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export function IconFiles() {
  return (
    <Glyph>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M9 4v16" />
    </Glyph>
  )
}

export function IconSearch() {
  return (
    <Glyph>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-3.6-3.6" />
    </Glyph>
  )
}

export function IconSpark() {
  return (
    <Glyph>
      <path d="M12 3.5l1.4 4.6L18 9.5l-4.6 1.4L12 15.5l-1.4-4.6L6 9.5l4.6-1.4L12 3.5z" />
      <path d="M18 14.5l.6 2 2 .6-2 .6-.6 2-.6-2-2-.6 2-.6.6-2z" />
    </Glyph>
  )
}

export function IconSettings() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.2v2.2M12 18.6V21M3.2 12h2.2M18.6 12H21M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" />
    </Glyph>
  )
}

export function IconSend() {
  return (
    <Glyph>
      <path d="M12 19V5" />
      <path d="M6.5 10.5L12 5l5.5 5.5" />
    </Glyph>
  )
}

export function IconStop() {
  return (
    <Glyph>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </Glyph>
  )
}

export function IconLock() {
  return (
    <Glyph className="tree-lock">
      <rect x="6" y="11" width="12" height="9" rx="1.5" />
      <path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11" />
    </Glyph>
  )
}

export function IconTrash() {
  return (
    <Glyph>
      <path d="M4 7h16" />
      <path d="M9 7V4.8h6V7" />
      <path d="M8 7l.8 13h6.4L16 7" />
    </Glyph>
  )
}
