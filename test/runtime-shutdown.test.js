const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { test } = require('node:test')
const { loadTypeScriptModule } = require('./helpers/typescript-module-loader')

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('shutdown drains HTTP, CookieCloud and tasks without restarting jobs after late config changes', async () => {
  const cloud = deferred()
  const tasks = deferred()
  const events = []
  let cookieDeps
  let contextDeps
  let serverOptions
  let finishHttp
  let applyCount = 0
  let cronStarts = 0
  const config = { cookieCloud: { cron: '0 0 * * *' } }
  const server = new EventEmitter()
  server.address = () => ({ port: 12345 })
  server.close = (callback) => {
    events.push('http-closing')
    finishHttp = callback
  }
  const { startDockerRuntime } = loadTypeScriptModule('src/docker/runtime.ts', {
    './logger': { createLogger: () => () => {} },
    './config-store': { loadConfigFromDisk: () => config, saveConfigToDisk: () => {} },
    './runtime-cookie-source': {
      DockerCookieSourceManager: class {
        constructor(deps) {
          cookieDeps = deps
        }

        hasCookieCloudSource() {
          return true
        }

        async persistEffectiveCookies() {
          await cloud.promise
          cookieDeps.applyConfig({ ...config, marker: 'cloud' }, 'cookie_saved')
          events.push('cloud-finished')
          return { updated: true }
        }
      },
    },
    './runtime-config-service': {
      DockerRuntimeConfigService: class {
        constructor(deps) {
          this.deps = deps
        }

        applyConfig(next, reason) {
          applyCount++
          const prev = this.deps.getCurrentConfig()
          this.deps.setCurrentConfig(next)
          this.deps.reconcileCookieCloudSync(prev, next)
          this.deps.reconcileTaskJobs(prev, next, true)
          events.push(reason)
        }
      },
    },
    './runtime-scheduler': {
      DockerTaskScheduler: class {
        reconcileTaskJobs() {
          cronStarts++
        }

        stopJobs() {
          events.push('tasks-stopped')
        }

        async waitForIdle() {
          events.push('tasks-waiting')
          await tasks.promise
          events.push('tasks-finished')
        }
      },
    },
    './runtime-app-context': {
      createRuntimeAppContext: (deps) => {
        contextDeps = deps
        return {}
      },
    },
    './server': {
      createServer: (_ctx, options) => {
        serverOptions = options
        return {
          listen: () => {
            queueMicrotask(() => server.emit('listening'))
            return server
          },
        }
      },
    },
    'cron': {
      CronJob: class {
        start() {
          cronStarts++
        }

        stop() {
          events.push('cloud-stopped')
        }

        nextDate() {
          return { toISO: () => '2030-01-01T00:00:00Z' }
        }
      },
    },
  })
  const runtime = await startDockerRuntime({ configPath: 'unused', webPort: 0, webPassword: 'test', handleSignals: false })
  assert.equal(serverOptions.isStopping(), false)
  assert.equal(cronStarts, 2)
  const closing = runtime.close()
  assert.equal(runtime.close(), closing)
  assert.equal(serverOptions.isStopping(), true)
  assert.ok(events.includes('cloud-stopped'))
  assert.ok(events.includes('tasks-stopped'))
  let closed = false
  void closing.then(() => {
    closed = true
  })
  contextDeps.applyConfig({ ...config, marker: 'save' }, 'tasks_saved')
  cookieDeps.applyConfig({ ...config, marker: 'recovery' }, 'cookie_saved')
  assert.equal(contextDeps.getCurrentConfig().marker, 'recovery')
  assert.equal(applyCount, 1)
  assert.equal(cronStarts, 2)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(closed, false)
  finishHttp()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(closed, false)
  assert.equal(events.includes('tasks-waiting'), false)
  cloud.resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(contextDeps.getCurrentConfig().marker, 'cloud')
  assert.equal(applyCount, 1)
  assert.equal(cronStarts, 2)
  assert.equal(events.includes('tasks-waiting'), true)
  assert.equal(closed, false)
  tasks.resolve()
  await closing
  assert.equal(closed, true)
})

test('CookieCloud shutdown waiters are released when an in-flight sync fails', async () => {
  const gate = deferred()
  const { DockerCookieCloudSyncService } = loadTypeScriptModule('src/docker/runtime-cookie-cloud-sync.ts')
  const service = new DockerCookieCloudSyncService({
    hasCookieCloudSource: () => true,
    logSystem: () => {},
    persistEffectiveCookies: async () => {
      await gate.promise
      throw new Error('offline failure')
    },
  })
  const sync = service.syncSnapshot('startup')
  service.stop()
  let idle = false
  const waiting = service.waitForIdle().then(() => {
    idle = true
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(idle, false)
  gate.resolve()
  await Promise.all([sync, waiting])
  assert.equal(idle, true)
  await service.waitForIdle()
})
