import { app, BrowserWindow, dialog, Menu, nativeImage, session, shell, Tray } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import type { RuntimeHandle } from '../docker/runtime'

app.setName('douyu-keep')
app.setAppUserModelId('io.github.knaifen.douyu-keep')
if (process.env.DOUYU_KEEP_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.DOUYU_KEEP_DATA_DIR))
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let runtime: RuntimeHandle | undefined
let quitting = false
let exitReady = false
let pendingShow = false

function showWindow(): void {
  pendingShow = true
  if (mainWindow && !quitting) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }
}

async function openDataDirectory(): Promise<void> {
  const error = await shell.openPath(app.getPath('userData'))
  if (error) {
    dialog.showErrorBox('无法打开配置目录', error)
  }
}

function startupOptions() {
  return { path: `"${process.execPath}"`, args: ['--hidden'] }
}

function updateTrayMenu(): void {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 douyu-keep', click: showWindow },
    { label: '打开配置目录', click: () => {
      void openDataDirectory()
    } },
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      enabled: app.isPackaged,
      checked: app.getLoginItemSettings(startupOptions()).openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ ...startupOptions(), openAtLogin: item.checked })
        updateTrayMenu()
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]))
}

async function startDesktop(): Promise<void> {
  const dataDir = app.getPath('userData')
  fs.mkdirSync(dataDir, { recursive: true })
  const { startDockerRuntime } = await import('../docker/runtime')
  const desktopToken = crypto.randomBytes(32).toString('hex')
  runtime = await startDockerRuntime({
    configPath: path.join(dataDir, 'config.json'),
    webPassword: crypto.randomBytes(32).toString('hex'),
    desktopToken,
    webHost: '127.0.0.1',
    webPort: 0,
    handleSignals: false,
  })
  const localUrl = runtime.url
  const desktopSession = session.fromPartition('desktop')
  desktopSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  desktopSession.setPermissionCheckHandler(() => false)
  desktopSession.webRequest.onBeforeSendHeaders({ urls: [`${localUrl}/*`] }, (details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, 'X-Douyu-Desktop-Token': desktopToken } })
  })
  const icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'icon.png'))
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'douyu-keep',
    icon,
    show: false,
    backgroundColor: '#171717',
    webPreferences: {
      session: desktopSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  Menu.setApplicationMenu(null)
  const openExternal = (url: string) => {
    try {
      const parsed = new URL(url)
      if (['https:', 'http:'].includes(parsed.protocol) && parsed.origin !== localUrl) {
        void shell.openExternal(parsed.href)
      }
    } catch {
      // Malformed navigation targets are ignored.
    }
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== localUrl) {
      event.preventDefault()
      openExternal(url)
    }
  })
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (new URL(url).origin !== localUrl) {
      event.preventDefault()
    }
  })
  mainWindow.on('close', (event) => {
    if (!quitting && tray) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.on('query-session-end', () => app.quit())
  mainWindow.on('session-end', () => {
    quitting = true
    void runtime?.close()
  })
  tray = new Tray(icon.resize({ width: 32, height: 32 }))
  tray.setToolTip('douyu-keep')
  tray.on('double-click', showWindow)
  updateTrayMenu()
  await mainWindow.loadURL(localUrl)
  if (!process.argv.includes('--hidden') || pendingShow) {
    showWindow()
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('activate', showWindow)
  app.on('window-all-closed', () => {
    if (!tray) {
      app.quit()
    }
  })
  app.on('before-quit', (event) => {
    if (exitReady) {
      return
    }
    event.preventDefault()
    if (quitting) {
      return
    }
    quitting = true
    tray?.setToolTip('douyu-keep: 正在退出')
    tray?.setContextMenu(Menu.buildFromTemplate([{ label: '正在等待任务结束...', enabled: false }]))
    const timer = setTimeout(() => app.exit(1), 30_000)
    void (runtime?.close() ?? Promise.resolve()).catch(() => {}).finally(() => {
      clearTimeout(timer)
      exitReady = true
      tray?.destroy()
      tray = null
      app.quit()
    })
  })
  void app.whenReady().then(startDesktop).catch((error: unknown) => {
    dialog.showErrorBox('douyu-keep 启动失败', `${error instanceof Error ? error.message : String(error)}\n配置目录：${app.getPath('userData')}`)
    app.quit()
  })
}
