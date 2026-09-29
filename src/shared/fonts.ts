export const EDITOR_FONTS = [
  'Times New Roman',
  'Georgia',
  'Palatino Linotype',
  'Garamond',
  'Cambria',
  'Segoe UI',
  'Calibri',
  'Consolas',
  'Microsoft YaHei'
] as const

export const DEFAULT_EDITOR_FONT = 'Times New Roman'

const SANS = new Set(['Segoe UI', 'Calibri', 'Microsoft YaHei'])

export function coerceEditorFont(value: unknown): string {
  return typeof value === 'string' && (EDITOR_FONTS as readonly string[]).includes(value) ? value : DEFAULT_EDITOR_FONT
}

export function editorFontStack(value: unknown): string {
  const name = coerceEditorFont(value)
  if (name === 'Consolas') return '"Consolas", "Courier New", monospace'
  if (SANS.has(name)) return `"${name}", "Segoe UI", "Microsoft YaHei", sans-serif`
  return `"${name}", "Times New Roman", Times, "Songti SC", "SimSun", serif`
}
