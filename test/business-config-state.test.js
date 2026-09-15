const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadTypeScriptModule } = require('./helpers/typescript-module-loader')

test('allocation validation rejects malformed room IDs and unsafe fixed counts', () => {
  const { validateJobConfig, validateDoubleCardConfig } = loadTypeScriptModule('src/docker/config-validation.ts')
  const base = { cron: '0 0 * * *', allocationMode: 'fixed', roomAllocations: { 101: { count: 1 } } }
  for (const roomId of ['0', '-1', '1.5', 'abc', '9007199254740992']) {
    assert.ok(validateJobConfig('keepalive', { ...base, roomAllocations: { [roomId]: { count: 1 } } }), roomId)
  }
  assert.ok(validateJobConfig('keepalive', { ...base, roomAllocations: { 101: { count: Number.MAX_SAFE_INTEGER + 1 } } }))
  for (const roomId of [0, -1, 1.5, true, null, '', Number.MAX_SAFE_INTEGER + 1]) {
    assert.ok(validateDoubleCardConfig({ ...base, participatingRoomIds: [roomId] }), String(roomId))
  }
  assert.equal(validateJobConfig('keepalive', base), null)
  assert.equal(validateDoubleCardConfig({ ...base, participatingRoomIds: [101] }), null)
})

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function cacheWith(getFansList) {
  const { DockerRuntimeCache } = loadTypeScriptModule('src/docker/runtime-cache.ts', {
    '../core/api': { getFansList, getGiftStatus: async () => ({}) },
    '../core/double-card': { checkDoubleCard: async () => ({ active: false }) },
  })
  return new DockerRuntimeCache()
}

test('fans synchronization cannot overwrite config saved while the remote list is pending', async () => {
  const { createDefaultDockerConfig } = loadTypeScriptModule('src/core/config-normalization.ts')
  const { DockerRuntimeFansSyncService } = loadTypeScriptModule('src/docker/runtime-fans-sync.ts')
  let config = createDefaultDockerConfig()
  const gate = deferred()
  const saved = []
  const service = new DockerRuntimeFansSyncService({
    getCurrentConfig: () => config,
    getConfigPath: () => 'unused',
    hasCookieCloudSource: () => false,
    resolveCookieForUrlFromConfig: () => 'synthetic',
    getFansList: () => gate.promise,
    invalidateStatusCaches: () => {},
    saveConfig: (_path, next) => saved.push(next),
    applyConfig: (next) => {
      config = next
    },
    runWithCookieSourceRetry: async (_context, run) => run(),
  })
  const pending = service.syncConfigWithFans('medal_synced')
  config = { ...config, loginCookies: { ...config.loginCookies, main: 'new-account' } }
  gate.resolve([])
  await assert.rejects(pending, /配置.*变化/)
  assert.equal(saved.length, 0)
  assert.equal(config.loginCookies.main, 'new-account')
})

test('background fans synchronization preserves same-account settings saved while loading', async () => {
  const { createDefaultDockerConfig } = loadTypeScriptModule('src/core/config-normalization.ts')
  const { DockerRuntimeFansSyncService } = loadTypeScriptModule('src/docker/runtime-fans-sync.ts')
  let config = createDefaultDockerConfig()
  const gate = deferred()
  const service = new DockerRuntimeFansSyncService({
    getCurrentConfig: () => config,
    getConfigPath: () => 'unused',
    hasCookieCloudSource: () => false,
    resolveCookieForUrlFromConfig: () => 'synthetic',
    getFansList: () => gate.promise,
    invalidateStatusCaches: () => {},
    saveConfig: () => {},
    applyConfig: (next) => {
      config = next
    },
    runWithCookieSourceRetry: async (_context, run) => run(),
  })
  const pending = service.syncConfigWithFans('medal_synced')
  config = { ...config, ui: { ...config.ui, themeMode: 'light' } }
  gate.resolve([])
  const result = await pending
  assert.equal(result.config.ui.themeMode, 'light')
  assert.equal(config.ui.themeMode, 'light')
})

test('failed account switch cannot relabel the previous account fans snapshot', async () => {
  let bRequests = 0
  const cache = cacheWith(async (cookie) => {
    if (cookie === 'account-a') {
      return [{ roomId: 101 }]
    }
    if (++bRequests === 1) {
      throw new Error('offline')
    }
    return [{ roomId: 202 }]
  })
  await cache.getFansList('account-a')
  await assert.rejects(cache.getFansList('account-b'), /offline/)
  assert.deepEqual(await cache.getFansList('account-b'), [{ roomId: 202 }])
  assert.equal(bRequests, 2)
})

test('A to B to A overlap cannot let an older A response replace the latest snapshot', async () => {
  const oldA = deferred()
  const b = deferred()
  let aRequests = 0
  const cache = cacheWith(cookie => cookie === 'account-b' ? b.promise : ++aRequests === 1 ? oldA.promise : Promise.resolve([{ roomId: 303 }]))
  const first = cache.getFansList('account-a')
  const second = cache.getFansList('account-b')
  assert.deepEqual(await cache.getFansList('account-a'), [{ roomId: 303 }])
  oldA.resolve([{ roomId: 101 }])
  b.resolve([{ roomId: 202 }])
  await Promise.all([first, second])
  assert.deepEqual(await cache.getFansList('account-a'), [{ roomId: 303 }])
})

test('complete fans status and staged base responses are scoped to the requested cookie', async () => {
  const cache = cacheWith(async cookie => [{ roomId: cookie === 'account-a' ? 101 : 202 }])
  const a = await cache.getFansStatus('account-a', () => {})
  assert.equal(a.fans[0].roomId, 101)
  assert.equal((await cache.getFansStatusBase('account-b')).fans[0].roomId, 202)
  assert.equal((await cache.getFansStatus('account-b', () => {})).fans[0].roomId, 202)
})

test('an in-flight account status request is not shared with another account', async () => {
  const a = deferred()
  const cache = cacheWith(cookie => cookie === 'account-a' ? a.promise : Promise.resolve([{ roomId: 202 }]))
  const first = cache.getFansStatus('account-a', () => {})
  const second = cache.getFansStatus('account-b', () => {})
  a.resolve([{ roomId: 101 }])
  assert.equal((await first).fans[0].roomId, 101)
  assert.equal((await second).fans[0].roomId, 202)
  assert.equal((await cache.getFansStatus('account-b', () => {})).fans[0].roomId, 202)
})
