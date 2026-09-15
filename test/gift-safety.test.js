const assert = require('node:assert/strict')
const test = require('node:test')
const { loadTypeScriptModule } = require('./helpers/typescript-module-loader')

function giftHarness(sendGift = async () => {}) {
  const attempts = []
  const delays = []
  const api = {
    parseDyAndSidFromCookie: () => ({}),
    getDid: async () => 'room-device',
    sleep: async ms => delays.push(ms),
    sendGift: async (_args, item) => {
      attempts.push({ ...item })
      await sendGift(item)
    },
  }
  const cache = new Map()
  const mocks = { './api': api }
  const utils = loadTypeScriptModule('src/core/job-gift-utils.ts', mocks, cache)
  const execution = loadTypeScriptModule('src/core/gift-execution.ts', mocks, cache)
  return { api, utils, execution, attempts, delays, mocks, cache }
}

function jobs() {
  return Object.fromEntries([1, 2, 3].map(roomId => [roomId, Object.freeze({ roomId, giftId: 268, count: roomId })]))
}

test('consecutive failures carry each allocation once and leave the plan unchanged', async () => {
  const harness = giftHarness(async (item) => {
    if (item.roomId < 3) {
      throw new Error('rejected')
    }
  })
  const plan = Object.freeze(jobs())
  await harness.utils.sendGifts({ jobs: plan, cookie: '', log: () => {} })
  assert.deepEqual(harness.attempts.map(item => item.count), [1, 3, 6])
  assert.deepEqual(Object.values(plan).map(item => item.count), [1, 2, 3])
  assert.deepEqual(harness.delays, [2000, 2000])
})

test('incomplete sending rejects with the correct remaining count', async () => {
  const harness = giftHarness(async () => {
    throw new Error('cookie expired')
  })
  await assert.rejects(harness.utils.sendGifts({ jobs: jobs(), cookie: '', log: () => {} }), /有6个.*未赠送成功/)
})

test('a rejected mutation is unsafe to replay even when no success response was received', async () => {
  const harness = giftHarness(async () => {
    throw new Error('response lost')
  })
  await assert.rejects(harness.execution.runGiftExecution(() => harness.utils.sendGifts({
    jobs: { 1: jobs()[1] },
    cookie: '',
    log: () => {},
  })), (error) => {
    assert.equal(harness.execution.isGiftTaskReplayUnsafe(error), true)
    return true
  })
})

test('keepalive allocation failures reject without sending', async () => {
  const harness = giftHarness()
  harness.api.getGiftNumber = async () => 1
  const { executeKeepaliveJob } = loadTypeScriptModule('src/core/keepalive-job.ts', harness.mocks, harness.cache)
  await assert.rejects(executeKeepaliveJob({
    allocationMode: 'fixed',
    roomAllocations: { 1: { count: 2 } },
  }, '', () => {}), /数量不足/)
  assert.equal(harness.attempts.length, 0)
})

test('parameter and backpack failures propagate to the task', async () => {
  const harness = giftHarness()
  harness.api.parseDyAndSidFromCookie = () => {
    throw new Error('missing sid')
  }
  harness.api.getGiftNumber = async () => {
    throw new Error('cookie expired')
  }
  harness.api.getBackpackStatus = harness.api.getGiftNumber
  await assert.rejects(harness.utils.sendGifts({ jobs: jobs(), cookie: '', log: () => {} }), /missing sid/)
  for (const loader of [harness.utils.loadGiftNumber, harness.utils.loadBackpackStatus]) {
    await assert.rejects(loader({ cookie: '', log: () => {} }), /cookie expired/)
  }
  assert.equal(harness.attempts.length, 0)
})

test('single active double room respects fixed counts, remainder, and zero', () => {
  const { computeGiftCountWithDoubleCard } = loadTypeScriptModule('src/core/gift.ts')
  for (const [count, expected] of [[3, 3], [-1, 20], [0, 0]]) {
    const result = computeGiftCountWithDoubleCard(20, {
      allocationMode: 'fixed',
      roomAllocations: { 1: { count }, 2: { count: 5 } },
    }, { 1: true, 2: false })
    assert.equal(result['1'].count, expected)
  }
})

test('runtime retries authentication before sending but never replays after any mutation', async () => {
  for (const mutate of [false, true]) {
    const harness = giftHarness()
    let runs = 0
    let recoveries = 0
    const job = {
      executeKeepaliveJob: async () => {
        runs++
        if (mutate) {
          // An earlier group succeeded; a later group fails before its own send.
          await harness.utils.sendGifts({ jobs: { 1: jobs()[1] }, cookie: '', log: () => {} })
        }
        if (runs === 1) {
          throw new Error('cookie expired')
        }
      },
    }
    const runners = loadTypeScriptModule('src/docker/runtime-task-runners.ts', {
      '../core/job': job,
      '../core/gift-execution': harness.execution,
    })
    const deps = {
      taskLoggers: { keepalive: () => {} },
      resolveCookieForUrl: () => '',
      runAndInvalidateStatusCache: async (_scope, run) => run(),
      refreshCookieSourceAfterFailure: async () => {
        recoveries++
        return true
      },
    }
    const result = runners.runRuntimeTask('keepalive', {}, deps)
    if (mutate) {
      await assert.rejects(result, /cookie expired/)
    } else {
      await result
    }
    assert.equal(runs, mutate ? 1 : 2)
    assert.equal(recoveries, mutate ? 0 : 1)
    assert.equal(harness.attempts.length, mutate ? 1 : 0)
  }
})
