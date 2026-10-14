import { app, BrowserWindow, ipcMain, net, protocol } from 'electron'
import { existsSync } from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import chokidar, { type FSWatcher } from 'chokidar'
import { libraryId } from '../shared/library'
import { normalizePosix } from '../shared/paths'
import { registerIpc } from './ipc'
import { invalidateSearch } from './search'
import { currentLibraries } from './settings'
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
    const libraries = await currentLibraries()
    const targets = libraries.filter((dir) => existsSync(dir))
    if (targets.length === 0) return
    watcher = chokidar.watch(targets, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 180, pollInterval: 40 },
      ignored: /(^|[\\/])\.|(\.tmp|\.bak)$/
    })
    const notify = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        invalidateSearch()
        if (win.isDestroyed()) return
        win.webContents.send('vault:changed', 'note')
        win.webContents.send('vault:changed', 'routine')
      }, 120)
    }
    watcher.on('add', notify).on('change', notify).on('unlink', notify).on('addDir', notify).on('unlinkDir', notify)
  }
  void arm()
  ipcMain.on('vault:rewatch', () => {
    void arm()
  })
}

app.setPath('userData', path.join(app.getPath('appData'), 'routine-notes'))
app.setAppUserModelId('com.string.notes')

app.whenReady().then(() => {
  protocol.handle('vault', async (request) => {
    const libraries = await currentLibraries()
    if (!libraries.length) return new Response('missing vault', { status: 404 })
    const url = new URL(request.url)
    const rel = normalizePosix(decodeURIComponent(url.pathname).replace(/^\/+/, ''))
    const slash = rel?.indexOf('/') ?? -1
    const id = rel && slash > 0 ? rel.slice(0, slash) : ''
    const inner = rel && slash > 0 ? rel.slice(slash + 1) : ''
    const root = libraries.find((item) => libraryId(item) === id)
    if (!root || !inner) return new Response('forbidden', { status: 403 })
    const abs = path.resolve(root, ...inner.split('/'))
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
