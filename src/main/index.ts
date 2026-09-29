import { app, BrowserWindow, ipcMain, net, protocol } from 'electron'
import { existsSync } from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import chokidar, { type FSWatcher } from 'chokidar'
import { normalizePosix, zoneFolder } from '../shared/paths'
import type { Zone } from '../shared/types'
import { registerIpc } from './ipc'
import { invalidateSearch } from './search'
import { currentVault } from './settings'
import { installUpdate, registerUpdater } from './update'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vault',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true
    }
  }
])

let allowClose = false
let flushing = false

function createWindow(): BrowserWindow {
  const iconPath = path.join(__dirname, '../../resources/icon.ico')
  const win = new BrowserWindow({
    title: 'String',
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    backgroundColor: '#f7f6f3',
    show: false,
    autoHideMenuBar: true,
    icon: existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())
  win.webContents.on('console-message', (details) => {
    if (details.message.includes('Electron Security Warning')) return
    if (details.level === 'error' || details.level === 'warning') {
      console.log(`[renderer:${details.level}] ${details.message}`)
    }
  })

  win.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    if (flushing) return
    flushing = true
    const finish = (): void => {
      allowClose = true
      flushing = false
      win.close()
    }
    const timer = setTimeout(finish, 2000)
    ipcMain.once('app:flush-done', () => {
      clearTimeout(timer)
      finish()
    })
    if (!win.webContents.isDestroyed()) win.webContents.send('app:flush')
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

function watchVault(win: BrowserWindow): void {
  let watcher: FSWatcher | null = null
  let timer: NodeJS.Timeout | null = null
  const arm = async (): Promise<void> => {
    await watcher?.close()
    watcher = null
    const root = await currentVault()
    if (!root) return
    const targets = (['note', 'routine'] as Zone[])
      .map((zone) => path.join(root, zoneFolder(zone)))
      .filter((dir) => existsSync(dir))
    if (targets.length === 0) return
    watcher = chokidar.watch(targets, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 180, pollInterval: 40 },
      ignored: /(^|[\\/])\.|(\.tmp|\.bak)$/
    })
    const notify = (filePath: string): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const zone = zoneOf(root, filePath)
        if (!zone) return
        invalidateSearch(zone)
        if (!win.isDestroyed()) win.webContents.send('vault:changed', zone)
      }, 120)
    }
    watcher.on('add', notify).on('change', notify).on('unlink', notify).on('addDir', notify).on('unlinkDir', notify)
  }
  void arm()
  ipcMain.on('vault:rewatch', () => {
    void arm()
  })
}

function zoneOf(root: string, filePath: string): Zone | null {
  for (const zone of ['note', 'routine'] as Zone[]) {
    const zoneRoot = path.join(root, zoneFolder(zone))
    const rel = path.relative(zoneRoot, filePath)
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return zone
  }
  return null
}

app.setPath('userData', path.join(app.getPath('appData'), 'routine-notes'))
app.setAppUserModelId('com.string.notes')

app.whenReady().then(() => {
  protocol.handle('vault', async (request) => {
    const root = await currentVault()
    if (!root) return new Response('missing vault', { status: 404 })
    const url = new URL(request.url)
    const rel = normalizePosix(decodeURIComponent(url.pathname).replace(/^\/+/, ''))
    if (!rel || (!rel.startsWith('Note/') && !rel.startsWith('Routine/'))) {
      return new Response('forbidden', { status: 403 })
    }
    const abs = path.resolve(root, ...rel.split('/'))
    const relative = path.relative(path.resolve(root), abs)
    if (relative.startsWith('..') || path.isAbsolute(relative)) return new Response('forbidden', { status: 403 })
    if (!existsSync(abs)) return new Response('missing', { status: 404 })
    return net.fetch(pathToFileURL(abs).href)
  })

  const win = createWindow()
  registerIpc(win)
  registerUpdater(win)
  watchVault(win)

  ipcMain.handle('window:close', () => win.close())
  ipcMain.handle('updater:install', () => {
    allowClose = true
    installUpdate()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
