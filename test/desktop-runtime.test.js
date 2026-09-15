const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { loadTypeScriptModule } = require('./helpers/typescript-module-loader')

test('desktop runtime binds loopback, protects config, persists it and closes cleanly', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyu-desktop-test-'))
  const { startDockerRuntime } = loadTypeScriptModule('src/docker/runtime.ts')
  const desktopToken = crypto.randomBytes(32).toString('hex')
  const configPath = path.join(dataDir, 'config.json')
  const runtime = await startDockerRuntime({ configPath, webPort: 0, webHost: '127.0.0.1', webPassword: 'synthetic-test-password', desktopToken, handleSignals: false })
  try {
    assert.equal(runtime.server.address().address, '127.0.0.1')
    assert.equal((await fetch(`${runtime.url}/api/config`)).status, 401)
    assert.equal((await fetch(`${runtime.url}/api/config`, { headers: { 'X-Douyu-Desktop-Token': 'incorrect' } })).status, 401)
    const response = await fetch(`${runtime.url}/api/config`, { headers: { 'X-Douyu-Desktop-Token': desktopToken } })
    assert.equal(response.status, 200)
    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    assert.equal(persisted.loginCookies.main, '')
    assert.equal(JSON.stringify(persisted).includes(desktopToken), false)
    const status = await fetch(`${runtime.url}/api/auth/status`, { headers: { 'X-Douyu-Desktop-Token': desktopToken } })
    assert.deepEqual(await status.json(), { authenticated: true })
  } finally {
    await runtime.close()
    await runtime.close()
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
  assert.equal(runtime.server.listening, false)
})

test('invalid existing config stops startup without replacing user data', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'douyu-desktop-invalid-'))
  const configPath = path.join(dataDir, 'config.json')
  const source = '{ invalid existing config'
  fs.writeFileSync(configPath, source)
  const { startDockerRuntime } = loadTypeScriptModule('src/docker/runtime.ts')
  try {
    await assert.rejects(startDockerRuntime({ configPath, webPort: 0, webHost: '127.0.0.1', webPassword: 'test', handleSignals: false }))
    assert.equal(fs.readFileSync(configPath, 'utf8'), source)
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
})
