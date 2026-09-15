const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { spawn, spawnSync } = require('node:child_process')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = path.resolve(__dirname, '..')
const stage = path.join(root, 'release/windows-x64')
const output = path.join(root, 'output/playwright')
const setup = path.join(root, `release/douyu-keep-${require('../package.json').version}-windows-x64.exe`)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitUntil(check, message) {
  for (let i = 0; i < 150; i++) {
    if (await check()) return
    await wait(100)
  }
  throw new Error(message)
}

async function browserSmoke() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyu-browser-'))
  const token = crypto.randomBytes(32).toString('hex')
  const child = spawn(path.join(stage, 'runtime/node.exe'), [path.join(stage, 'app/build/docker/desktop/server.js')], {
    cwd: os.tmpdir(), windowsHide: true,
    env: { ...process.env, DOUYU_KEEP_DATA_DIR: dataDir, DOUYU_KEEP_LAUNCHER_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  child.stdout.on('data', data => { logs += data })
  child.stderr.on('data', data => { logs += data })
  let browser
  try {
    await waitUntil(() => logs.includes('"desktopReady":true'), 'Backend did not become ready')
    const { url } = JSON.parse(logs.split(/\r?\n/).find(line => line.startsWith('{"desktopReady":true')))
    assert.equal(logs.includes(token), false)
    assert.equal((await fetch(`${url}/api/config`)).status, 401)
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${url}/#web-password=${token}`)
    await page.locator('#app-shell').waitFor({ state: 'visible' })
    assert.equal(page.url().includes(token), false)
    assert.equal(await page.locator('.brand-logo').evaluate(img => img.complete && img.naturalWidth > 0), true)
    for (const key of ['login', 'collect', 'keepalive', 'double-card', 'expiring-gift', 'yuba', 'logs', 'overview']) {
      await page.locator(`#tab-${key}`).click()
      await page.locator(`#page-${key}`).waitFor({ state: 'visible' })
    }
    await page.locator('[data-theme-mode="dark"]').click()
    await waitUntil(() => JSON.parse(fs.readFileSync(path.join(dataDir, 'config.json'), 'utf8')).ui.themeMode === 'dark', 'Theme did not persist')
    fs.mkdirSync(output, { recursive: true })
    await page.screenshot({ path: path.join(output, 'browser-overview.png'), fullPage: true })
    await page.locator('#tab-login').click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: path.join(output, 'browser-mobile-login.png'), fullPage: true })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.equal(await page.evaluate(async () => (await fetch('/api/desktop/shutdown', { method: 'POST' })).status), 403)
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await page.locator('#app-shell').waitFor({ state: 'detached' })
    await page.goto(`${url}/#web-password=${token}`)
    await page.locator('#app-shell').waitFor({ state: 'visible' })
    assert.deepEqual(errors, [])
    assert.equal((await fetch(`${url}/api/desktop/shutdown`, { method: 'POST', headers: { 'X-Douyu-Desktop-Token': token } })).status, 200)
    await waitUntil(() => child.exitCode !== null, 'Backend did not exit gracefully')
    assert.equal(child.exitCode, 0)
    console.log('Browser smoke passed: auto auth, URL cleanup, assets, eight pages, config persistence, responsive layout, logout/relogin, shutdown authorization.')
  } finally {
    if (browser) await browser.close()
    if (child.exitCode === null) child.kill()
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
}

async function launcherSmoke() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyu-launcher-'))
  const env = { ...process.env, DOUYU_KEEP_DATA_DIR: dataDir }
  const exe = path.join(stage, 'douyu-keep.exe')
  const child = spawn(exe, ['--hidden'], { env, windowsHide: true, stdio: 'ignore' })
  const logPath = path.join(dataDir, 'backend.log')
  try {
    await waitUntil(() => fs.existsSync(logPath) && fs.readFileSync(logPath, 'utf8').includes('WebUI'), 'Native launcher did not start')
    const url = fs.readFileSync(logPath, 'utf8').match(/http:\/\/127\.0\.0\.1:\d+/)[0]
    assert.equal((await fetch(`${url}/api/auth/status`)).status, 200)
    const blocked = spawnSync(setup, ['/S'], { windowsHide: true, timeout: 15000 })
    assert.equal(blocked.status, 1, 'Installer must refuse to modify a running app')
    const stop = spawnSync(exe, ['--stop'], { env, windowsHide: true, timeout: 40000 })
    assert.equal(stop.status, 0)
    await waitUntil(() => child.exitCode !== null, 'Launcher did not exit')
    await assert.rejects(fetch(`${url}/api/auth/status`))
    console.log('Native launcher smoke passed: hidden startup, bundled Node, installer running guard, graceful stop, no orphaned server.')
  } finally {
    if (child.exitCode === null) spawnSync(exe, ['--stop'], { env, windowsHide: true, timeout: 40000 })
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
}

async function installerSmoke() {
  const installDir = path.join(root, '.temp', `native install ${Date.now()}`)
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyu-install-'))
  const env = { ...process.env, DOUYU_KEEP_DATA_DIR: dataDir }
  // NSIS requires the final /D argument unquoted, including spaces in its value.
  const result = spawnSync(setup, ['/S', `/D=${installDir}`], { windowsHide: true, windowsVerbatimArguments: true, timeout: 120000 })
  assert.equal(result.status, 0)
  const exe = path.join(installDir, 'douyu-keep.exe')
  assert.equal(fs.existsSync(exe), true, 'Installer must honor the selected directory')
  const child = spawn(exe, ['--hidden'], { env, windowsHide: true, stdio: 'ignore' })
  try {
    await waitUntil(() => fs.existsSync(path.join(dataDir, 'config.json')), 'Installed launcher did not start')
    const blocked = spawnSync(path.join(installDir, 'Uninstall.exe'), ['/S', `_?=${installDir}`], { windowsHide: true, windowsVerbatimArguments: true, timeout: 15000 })
    assert.equal(blocked.status, 1, 'Uninstaller must refuse to modify a running app')
    assert.equal(fs.existsSync(exe), true)
    assert.equal(spawnSync(exe, ['--stop'], { env, windowsHide: true, timeout: 40000 }).status, 0)
    await waitUntil(() => child.exitCode !== null, 'Installed launcher did not exit')
    const uninstall = spawnSync(path.join(installDir, 'Uninstall.exe'), ['/S', `_?=${installDir}`], { windowsHide: true, windowsVerbatimArguments: true, timeout: 120000 })
    assert.equal(uninstall.status, 0)
    assert.equal(fs.existsSync(exe), false)
    assert.equal(fs.existsSync(path.join(dataDir, 'config.json')), true)
    console.log('Installer smoke passed: spaced install path, bundled runtime launch, uninstall, config retention.')
  } finally {
    if (child.exitCode === null) spawnSync(exe, ['--stop'], { env, windowsHide: true, timeout: 40000 })
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
}

async function earlyStopSmoke() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'douyu-delayed-'))
  const dataDir = path.join(fixture, 'data')
  const env = { ...process.env, DOUYU_KEEP_DATA_DIR: dataDir }
  const exe = path.join(fixture, 'douyu-keep.exe')
  fs.mkdirSync(path.join(fixture, 'runtime'))
  fs.mkdirSync(path.join(fixture, 'app/build/docker/desktop'), { recursive: true })
  fs.copyFileSync(path.join(stage, 'douyu-keep.exe'), exe)
  fs.copyFileSync(path.join(stage, 'runtime/node.exe'), path.join(fixture, 'runtime/node.exe'))
  fs.writeFileSync(path.join(fixture, 'app/build/docker/desktop/server.js'), `
    console.log('delayed backend started');
    setTimeout(() => {
      const server = require('node:http').createServer((req, res) => {
        if (req.url !== '/api/desktop/shutdown' || req.headers['x-douyu-desktop-token'] !== process.env.DOUYU_KEEP_LAUNCHER_TOKEN) {
          res.writeHead(403).end(); return;
        }
        res.end('{}', () => server.close(() => process.exit(0)));
      });
      server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ desktopReady: true, url: 'http://127.0.0.1:' + server.address().port })));
    }, 1000);
  `)
  const child = spawn(exe, ['--hidden'], { env, windowsHide: true, stdio: 'ignore' })
  try {
    await waitUntil(() => fs.existsSync(path.join(dataDir, 'backend.log')), 'Delayed backend did not start')
    const started = Date.now()
    const stop = spawnSync(exe, ['--stop'], { env: { ...env, DOUYU_KEEP_DATA_DIR: dataDir + path.sep }, windowsHide: true, timeout: 6000 })
    assert.equal(stop.status, 0)
    await waitUntil(() => child.exitCode !== null, 'Early stop failed')
    assert.ok(Date.now() - started < 6000, 'Early stop must drain promptly, including an equivalent data path')
    console.log('Early stop smoke passed: delayed readiness, authenticated shutdown, normalized data-directory instance lock.')
  } finally {
    if (child.exitCode === null) spawnSync(exe, ['--stop'], { env, windowsHide: true, timeout: 40000 })
    fs.rmSync(fixture, { recursive: true, force: true })
  }
}

browserSmoke().then(launcherSmoke).then(installerSmoke).then(earlyStopSmoke).catch(error => { console.error(error); process.exitCode = 1 })
