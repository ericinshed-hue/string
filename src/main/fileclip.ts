import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { clipboard } from 'electron'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

let held: string[] = []

export function copyText(text: string): void {
  held = []
  clipboard.writeText(text)
}

export async function copyFiles(paths: string[]): Promise<void> {
  if (!paths.length) throw new Error('Nothing to copy')
  held = paths
  clipboard.clear()
  if (process.platform !== 'win32') {
    clipboard.writeText(paths.join('\n'))
    return
  }
  const payload = Buffer.from(`${paths.join('\0')}\0`, 'ucs2')
  try {
    clipboard.writeBuffer('FileNameW', payload)
  } catch {
    // The in-app list still lets Paste work inside this window.
  }
  await publishWindowsFiles(paths).catch(() => undefined)
}

export function canPasteFiles(): boolean {
  return filesToPaste().length > 0
}

export function filesToPaste(): string[] {
  const fromOs = readWindowsFiles()
  if (fromOs.length) return fromOs
  if (clipboard.readText().trim()) return []
  return held
}

function readWindowsFiles(): string[] {
  if (process.platform !== 'win32') return []
  let buffer: Buffer
  try {
    buffer = clipboard.readBuffer('FileNameW')
  } catch {
    return []
  }
  if (!buffer.length) return []
  let start = 0
  const looksLikePath = buffer.length >= 4 && buffer[1] === 0 && /[A-Za-z]/.test(String.fromCharCode(buffer[0]))
  if (!looksLikePath && buffer.length > 20) {
    const offset = buffer.readUInt32LE(0)
    if (offset > 0 && offset < buffer.length) start = offset
  }
  return buffer
    .subarray(start)
    .toString('ucs2')
    .replace(/\0+$/, '')
    .split('\0')
    .map((item) => item.trim())
    .filter((item) => item.length > 1)
}

function publishWindowsFiles(paths: string[]): Promise<void> {
  const listFile = path.join(tmpdir(), `routine-copy-${randomUUID()}.txt`)
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$raw = Get-Content -LiteralPath $env:ROUTINE_COPY_LIST -Encoding UTF8 -Raw',
    '$list = New-Object System.Collections.Specialized.StringCollection',
    'foreach ($line in ($raw -split "`n")) {',
    '  $line = $line.TrimEnd("`r")',
    '  if ($line) { [void]$list.Add($line) }',
    '}',
    'if ($list.Count -gt 0) { [System.Windows.Forms.Clipboard]::SetFileDropList($list) }'
  ].join('; ')

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      void fs.rm(listFile, { force: true })
      if (error) reject(error)
      else resolve()
    }
    void fs.writeFile(listFile, paths.join('\n'), 'utf8').then(() => {
      const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
        windowsHide: true,
        env: { ...process.env, ROUTINE_COPY_LIST: listFile }
      })
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill()
        finish(new Error('Could not copy the file'))
      }, 8000)
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        finish(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        finish(code === 0 ? undefined : new Error(stderr.trim() || 'Could not copy the file'))
      })
    }, finish)
  })
}
