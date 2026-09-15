const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const appId = 'io.github.knaifen.douyu-keep'

async function main() {
  const root = path.resolve(__dirname, '..')
  const installDir = path.join(root, '.temp', `installer smoke ${Date.now()}`)
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyu-installer-smoke-'))
  const existing = spawnSync('reg.exe', ['query', runKey, '/v', appId], { windowsHide: true, encoding: 'utf8' })
  assert.notEqual(existing.status, 0, 'Do not overwrite an existing startup registration')
  assert.equal(fs.existsSync(installDir), false, 'Use a fresh test installation directory')
  const env = { ...process.env, DOUYU_KEEP_DATA_DIR: dataDir }
  delete env.ELECTRON_RUN_AS_NODE
  let app
  let installed = false
  try {
    const setup = path.join(root, 'release/douyu-keep-3.10.0-windows-x64.exe')
    const result = spawnSync(setup, ['/S', '/currentuser', `/D=${installDir}`], { windowsHide: true, timeout: 120_000 })
    assert.equal(result.status, 0, 'NSIS installation failed')
    installed = true
    const executablePath = path.join(installDir, 'douyu-keep.exe')
    assert.equal(fs.existsSync(executablePath), true)
    app = await electron.launch({ executablePath, cwd: os.tmpdir(), env, timeout: 60_000 })
    const page = await app.firstWindow()
    await page.locator('#app-shell').waitFor({ state: 'visible', timeout: 30_000 })
    const enabled = await app.evaluate(({ app }) => {
      const options = { path: `"${process.execPath}"`, args: ['--hidden'] }
      app.setLoginItemSettings({ ...options, openAtLogin: true })
      return app.getLoginItemSettings(options)
    })
    assert.equal(enabled.openAtLogin, true)
    assert.equal(enabled.launchItems.some(item => item.name === appId && item.enabled), true)
    const disabled = await app.evaluate(({ app }) => {
      const options = { path: `"${process.execPath}"`, args: ['--hidden'] }
      app.setLoginItemSettings({ ...options, openAtLogin: false })
      return app.getLoginItemSettings(options).openAtLogin
    })
    assert.equal(disabled, false)
    await app.evaluate(({ app }) => app.setLoginItemSettings({ path: `"${process.execPath}"`, args: ['--hidden'], openAtLogin: true }))
    await app.close()
    app = undefined
    const uninstall = spawnSync(path.join(installDir, 'Uninstall douyu-keep.exe'), ['/S', '/currentuser', `_?=${installDir}`], { windowsHide: true, windowsVerbatimArguments: true, timeout: 120_000 })
    assert.equal(uninstall.status, 0, 'NSIS uninstall failed')
    installed = false
    assert.equal(fs.existsSync(executablePath), false)
    assert.notEqual(spawnSync('reg.exe', ['query', runKey, '/v', appId], { windowsHide: true }).status, 0)
    assert.equal(fs.existsSync(path.join(dataDir, 'config.json')), true)
    console.log('Installer smoke passed: silent user installation, path with spaces, installed app launch, startup on/off, uninstall removes executable/startup and preserves config.')
  } finally {
    if (app) await app.close()
    if (installed) {
      spawnSync(path.join(installDir, 'Uninstall douyu-keep.exe'), ['/S', '/currentuser', `_?=${installDir}`], { windowsHide: true, windowsVerbatimArguments: true, timeout: 120_000 })
    }
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
