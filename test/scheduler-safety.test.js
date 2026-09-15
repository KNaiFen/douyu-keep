const assert = require('node:assert/strict')
const test = require('node:test')
const { loadTypeScriptModule } = require('./helpers/typescript-module-loader')

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function createScheduler(run = async () => {}) {
  const jobs = []
  class CronJob {
    constructor(_cron, callback) {
      this.callback = callback
      jobs.push(this)
    }

    start() {}
    stop() {}
    nextDate() {
      return { toISO: () => '2030-01-01T00:00:00Z' }
    }
  }
  const { DockerTaskScheduler } = loadTypeScriptModule('src/docker/runtime-scheduler.ts', {
    'cron': { CronJob },
    '../core/job': {
      executeCollectGiftJob: () => run('collectGift'),
      executeKeepaliveJob: () => run('keepalive'),
      executeDoubleCardJob: () => run('doubleCard'),
      executeExpiringGiftJob: () => run('expiringGift'),
      executeYubaCheckInJob: () => run('yubaCheckIn'),
    },
  })
  const scheduler = new DockerTaskScheduler({
    logSystem: () => {},
    taskLoggers: Object.fromEntries(['collectGift', 'keepalive', 'doubleCard', 'expiringGift', 'yubaCheckIn'].map(type => [type, () => {}])),
    resolveCookieForUrl: () => '',
    refreshCookieSourceAfterFailure: async () => false,
    runAndInvalidateStatusCache: async (_scope, task) => task(),
  })
  return { scheduler, jobs }
}

const options = { onBusy: 'throw', busyMessage: 'busy' }

test('inventory tasks queue in order while independent Yuba work can run', async () => {
  const { scheduler } = createScheduler()
  const gate = deferred()
  const events = []
  const first = scheduler.runTaskWithLock('keepalive', async () => {
    events.push('keepalive')
    await gate.promise
  }, options)
  const queued = ['doubleCard', 'expiringGift', 'collectGift'].map(type => scheduler.runTaskWithLock(type, async () => {
    events.push(type)
  }, options))
  await scheduler.runTaskWithLock('yubaCheckIn', async () => {
    events.push('yubaCheckIn')
  }, options)
  assert.deepEqual(events, ['yubaCheckIn', 'keepalive'])
  await assert.rejects(scheduler.runTaskWithLock('doubleCard', async () => {}, options), /busy/)
  assert.equal(await scheduler.runTaskWithLock('keepalive', async () => {}, { ...options, onBusy: 'skip' }), false)
  gate.resolve()
  await Promise.all([first, ...queued])
  assert.deepEqual(events, ['yubaCheckIn', 'keepalive', 'doubleCard', 'expiringGift', 'collectGift'])
})

test('failed inventory work releases the queue and idle waits include queued and independent tasks', async () => {
  const { scheduler } = createScheduler()
  const inventory = deferred()
  const yuba = deferred()
  const first = scheduler.runTaskWithLock('keepalive', async () => {
    throw new Error('failure')
  }, options)
  const failure = assert.rejects(first, /failure/)
  const second = scheduler.runTaskWithLock('doubleCard', () => inventory.promise, options)
  const independent = scheduler.runTaskWithLock('yubaCheckIn', () => yuba.promise, options)
  let idle = false
  const waiting = scheduler.waitForIdle().then(() => {
    idle = true
  })
  await failure
  assert.equal(idle, false)
  inventory.resolve()
  await second
  assert.equal(idle, false)
  yuba.resolve()
  await Promise.all([independent, waiting])
  assert.equal(idle, true)
  assert.equal(await scheduler.runTaskWithLock('keepalive', async () => {}, options), true)
})

test('scheduled and manual inventory tasks share locks across cron reload and stop', async () => {
  const started = deferred()
  const gate = deferred()
  const events = []
  const { scheduler, jobs } = createScheduler(async (type) => {
    events.push(type)
    if (type === 'keepalive') {
      started.resolve()
      await gate.promise
    }
  })
  const config = {
    keepalive: { enabled: true, cron: '0 0 * * *' },
    doubleCard: { enabled: false, cron: '0 0 * * *' },
  }
  scheduler.reconcileTaskJobs(null, config, true)
  jobs[0].callback()
  await started.promise
  const next = { ...config, keepalive: { ...config.keepalive, cron: '0 1 * * *' } }
  scheduler.reconcileTaskJobs(config, next, true)
  jobs[1].callback()
  const manual = scheduler.triggerTask('doubleCard', config, () => true)
  scheduler.stopJobs()
  await assert.rejects(scheduler.triggerTask('keepalive', config, () => true), /任务正在执行中/)
  assert.deepEqual(events, ['keepalive'])
  gate.resolve()
  await Promise.all([manual, scheduler.waitForIdle()])
  assert.deepEqual(events, ['keepalive', 'doubleCard'])
})

test('Cookie field diagnostics distinguish missing fields from unchecked and never claim session validity', () => {
  const diagnostics = { value: null }
  const { buildLoginStatus } = loadTypeScriptModule('src/docker/webui/cookie-source-copy.ts', {
    './cookie-source-state': { cookieDiagnostics: diagnostics },
    './resource-state': { overview: { value: null } },
  })
  assert.deepEqual(buildLoginStatus().cells.map(cell => cell.value), ['等待检测', '等待检测', '等待检测'])
  diagnostics.value = { passport: { ltp0Present: true }, main: { ready: false }, yuba: { cookieReady: true } }
  assert.deepEqual(buildLoginStatus().cells.map(cell => cell.value), ['字段齐全', '字段缺失', '字段齐全'])
})
