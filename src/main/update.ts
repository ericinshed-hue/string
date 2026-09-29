import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

type Status =
  | { type: 'available'; version: string; notes: string }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'none'; version: string }
  | { type: 'error'; message: string }

let announceIdle = false

function notesOf(info: UpdateInfo): string {
  const notes = info.releaseNotes
  if (!notes) return ''
  if (typeof notes === 'string') return notes
  return notes.map((item) => item.note ?? '').join('\n').trim()
}

function send(win: BrowserWindow, status: Status): void {
  if (!win.isDestroyed()) win.webContents.send('updater:status', status)
}

export function registerUpdater(win: BrowserWindow): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    send(win, { type: 'available', version: info.version, notes: notesOf(info) })
  })
  autoUpdater.on('download-progress', (progress) => {
    send(win, { type: 'progress', percent: progress.percent })
  })
  autoUpdater.on('update-downloaded', (info) => {
    send(win, { type: 'downloaded', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    if (announceIdle) send(win, { type: 'none', version: app.getVersion() })
  })
  autoUpdater.on('error', (error) => {
    if (announceIdle) send(win, { type: 'error', message: error.message })
  })

  ipcMain.handle('updater:check', async (_event, quiet: boolean) => {
    announceIdle = !quiet
    if (!app.isPackaged) return { packaged: false, version: app.getVersion() }
    await autoUpdater.checkForUpdates()
    return { packaged: true, version: app.getVersion() }
  })

  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate())
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}
