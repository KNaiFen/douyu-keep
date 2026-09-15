const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const root = path.resolve(__dirname, '..')
  const executablePath = path.join(root, 'release/win-unpacked/douyu-keep.exe')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyu-keep-smoke-'))
  const output = path.join(root, 'output/playwright')
  fs.mkdirSync(output, { recursive: true })
  const env = { ...process.env, DOUYU_KEEP_DATA_DIR: dataDir }
  delete env.ELECTRON_RUN_AS_NODE
  let app
  try {
    app = await electron.launch({ executablePath, cwd: os.tmpdir(), env, timeout: 60_000 })
    const page = await app.firstWindow()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.locator('#app-shell').waitFor({ state: 'visible', timeout: 30_000 })
    assert.equal(await page.getByRole('button', { name: '退出登录', exact: true }).count(), 0)
    assert.match(await page.locator('.version-label').innerText(), /3\.10\.0/)
    assert.equal(await page.locator('.brand-logo').evaluate(img => img.complete && img.naturalWidth > 0), true)
    for (const key of ['login', 'collect', 'keepalive', 'double-card', 'expiring-gift', 'yuba', 'logs', 'overview']) {
      await page.locator(`#tab-${key}`).click()
      await page.locator(`#page-${key}`).waitFor({ state: 'visible' })
    }
    await page.locator('[data-theme-mode="dark"]').click()
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
    await page.screenshot({ path: path.join(output, 'desktop-overview.png'), fullPage: true })
    await page.locator('#tab-login').click()
    await page.screenshot({ path: path.join(output, 'desktop-login.png'), fullPage: true })
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setMinimumSize(320, 480)
      win.setContentSize(390, 844)
    })
    await page.waitForFunction(() => window.innerWidth === 390)
    await page.screenshot({ path: path.join(output, 'mobile-login.png'), fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false)
    const second = spawn(executablePath, [], { env, cwd: os.tmpdir(), windowsHide: true, stdio: 'ignore' })
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { second.kill(); reject(new Error('Second instance did not exit')) }, 15_000)
      second.once('error', reject)
      second.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Second instance exit ${code}`)) })
    })
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1)
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true)
    assert.deepEqual(errors, [])
    const url = page.url()
    assert.equal((await fetch(new URL('/api/config', url))).status, 401)
    await app.close()
    app = undefined
    const config = JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8'))
    assert.equal(config.ui.themeMode, 'dark')
    assert.equal(config.loginCookies.main, '')
    app = await electron.launch({ executablePath, cwd: os.tmpdir(), env, args: ['--hidden'], timeout: 60_000 })
    const hidden = await app.firstWindow()
    await hidden.locator('#app-shell').waitFor({ state: 'attached' })
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false)
    assert.equal(await hidden.evaluate(() => document.documentElement.dataset.theme), 'dark')
    console.log('Desktop smoke passed: assets, authentication, navigation, persistence, mobile layout, tray hide, single instance, hidden startup, graceful exit.')
  } finally {
    if (app) await app.close()
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
