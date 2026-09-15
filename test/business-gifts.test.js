const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadTypeScriptModule } = require('./helpers/typescript-module-loader')

test('an uncertain gift response must not transfer possibly sent inventory to another room', async () => {
  const attempts = []
  const { sendGifts } = loadTypeScriptModule('src/core/job-gift-utils.ts', {
    './api': {
      parseDyAndSidFromCookie: () => ({}),
      getDid: async () => 'fixture',
      sleep: async () => {},
      sendGift: async (_args, job) => {
        attempts.push(job.count)
        if (job.roomId === 1) {
          throw new Error('response timed out after remote acceptance')
        }
      },
    },
  })
  await assert.rejects(sendGifts({
    jobs: { 1: { roomId: 1, giftId: 268, count: 2 }, 2: { roomId: 2, giftId: 268, count: 3 } },
    cookie: '',
    log: () => {},
  }), /结果未知/)
  assert.deepEqual(attempts, [2])
})

test('gift API requires explicit business success and rejects malformed success envelopes', async () => {
  for (const data of [{}, [], { msg: 'login required' }, { error: 'invalid' }, { code: null }]) {
    const { sendGift } = loadTypeScriptModule('src/core/api.ts', { axios: { post: async () => ({ data }) } })
    await assert.rejects(sendGift({}, { roomId: 1, giftId: 268, count: 1 }, ''), /格式异常|成功状态/)
  }
  for (const data of [{ error: 0 }, { error: '0' }, { code: 200 }, { code: '0' }]) {
    const { sendGift } = loadTypeScriptModule('src/core/api.ts', { axios: { post: async () => ({ data }) } })
    assert.equal(await sendGift({}, { roomId: 1, giftId: 268, count: 1 }, ''), JSON.stringify(data))
  }
})

test('gift API validates every status field before classifying a response as a definite rejection', async () => {
  const execution = loadTypeScriptModule('src/core/gift-execution.ts')
  for (const data of [{ code: 200, status_code: 500 }, { error: 0, status_code: '500' }]) {
    const { sendGift } = loadTypeScriptModule('src/core/api.ts', {
      axios: { post: async () => ({ data }) },
      './gift-execution': execution,
    })
    await assert.rejects(sendGift({}, { roomId: 1, giftId: 268, count: 1 }, ''), execution.isGiftRejectionError)
  }
  for (const data of [
    { error: 99, code: 'invalid' },
    { code: 500, status_code: null },
    { code: 200, status_code: 'invalid' },
    { error: false, status_code: 500 },
  ]) {
    const { sendGift } = loadTypeScriptModule('src/core/api.ts', {
      axios: { post: async () => ({ data }) },
      './gift-execution': execution,
    })
    await assert.rejects(sendGift({}, { roomId: 1, giftId: 268, count: 1 }, ''), (error) => {
      assert.equal(execution.isGiftRejectionError(error), false)
      assert.match(error.message, /成功状态/)
      return true
    })
  }
})

test('weighted allocation cannot silently omit a positive-weight room when inventory is short', () => {
  const { computeGiftCountOfProportion } = loadTypeScriptModule('src/core/gift.ts')
  assert.throws(() => computeGiftCountOfProportion(1, { 1: { weight: 1 }, 2: { weight: 3 } }), /数量不足/)
  assert.throws(() => computeGiftCountOfProportion(2, { 1: { weight: 1 }, 2: { weight: 1 }, 3: { weight: 1 } }), /数量不足/)
  for (let budget = 3; budget <= 50; budget++) {
    const jobs = Object.values(computeGiftCountOfProportion(budget, { 1: { weight: 0 }, 2: { weight: 1 }, 3: { weight: 7 }, 4: { weight: 100 } }))
    assert.equal(jobs.reduce((sum, job) => sum + job.count, 0), budget)
    assert.equal(jobs[0].count, 0)
    assert.ok(jobs.slice(1).every(job => Number.isSafeInteger(job.count) && job.count >= 1))
  }
})

test('allocation and send boundaries reject invalid inventory or plans before any remote mutation', async () => {
  const { computeGiftCountOfNumber, computeGiftCountOfProportion } = loadTypeScriptModule('src/core/gift.ts')
  for (const budget of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => computeGiftCountOfNumber(budget, { 1: { count: -1 } }), /无效/)
    assert.throws(() => computeGiftCountOfProportion(budget, { 1: { weight: 1 } }), /无效/)
  }
  assert.throws(() => computeGiftCountOfProportion(10, { 1: { weight: 1e308 }, 2: { weight: 1e308 } }), /无效/)
  let calls = 0
  const { sendGifts } = loadTypeScriptModule('src/core/job-gift-utils.ts', {
    './api': {
      parseDyAndSidFromCookie: () => ({}),
      getDid: async () => 'fixture',
      sleep: async () => {},
      sendGift: async () => {
        calls++
      },
    },
  })
  for (const bad of [{ count: -1 }, { count: 1.5 }, { giftId: 0 }, { roomId: Number.NaN }]) {
    await assert.rejects(sendGifts({
      jobs: { 1: { roomId: 1, giftId: 268, count: 1 }, 2: { roomId: 2, giftId: 268, count: 1, ...bad } },
      cookie: '',
      log: () => {},
    }), /无效/)
  }
  assert.equal(calls, 0)
})

test('expiry selection excludes expired or malformed rows before they reach gift budgets', () => {
  const { selectExpiringGiftCandidates } = loadTypeScriptModule('src/core/gift-task.ts')
  const now = 1800000000000
  const rows = [
    { giftId: 268, count: 3, expireTime: now + 1000 },
    { giftId: 268, count: 100, expireTime: now - 1 },
    { giftId: 268, count: 100, expireTime: now },
    { giftId: 268, count: 100, expireTime: Number.NaN },
    { giftId: 268, count: 100, expireTime: Number.POSITIVE_INFINITY },
    { giftId: 0, count: 100, expireTime: now + 1000 },
    { giftId: 268, count: 1.5, expireTime: now + 1000 },
  ]
  for (const includeAllExpiring of [true, false]) {
    const result = selectExpiringGiftCandidates({ rows, totalRows: rows.length }, { now, thresholdHours: 24, includeAllExpiring })
    assert.equal(result.budgetCount, 3)
    assert.deepEqual(result.candidates, [rows[0]])
  }
})

test('explicit API rejection can transfer inventory but a lost response cannot', async () => {
  for (const rejected of [true, false]) {
    const attempts = []
    const mocks = {
      axios: {
        get: async () => ({ data: 'owner_uid = 123;' }),
        post: async (_url, body) => {
          const data = new URLSearchParams(body)
          attempts.push(Number(data.get('num')))
          if (attempts.length === 1) {
            if (!rejected) {
              throw new Error('network response lost')
            }
            return { data: { error: 99, msg: 'room rejected gift' } }
          }
          return { data: { error: 0 } }
        },
      },
    }
    const cache = new Map()
    const api = loadTypeScriptModule('src/core/api.ts', mocks, cache)
    api.sleep = async () => {}
    const { sendGifts } = loadTypeScriptModule('src/core/job-gift-utils.ts', mocks, cache)
    const { runGiftExecution, isGiftTaskReplayUnsafe } = loadTypeScriptModule('src/core/gift-execution.ts', mocks, cache)
    const run = () => runGiftExecution(() => sendGifts({
      jobs: { 1: { roomId: 1, giftId: 268, count: 2 }, 2: { roomId: 2, giftId: 268, count: 3 } },
      cookie: 'acf_uid=fixture; dy_did=fixture',
      log: () => {},
    }))
    if (rejected) {
      await run()
      assert.deepEqual(attempts, [2, 5])
    } else {
      await assert.rejects(run(), error => isGiftTaskReplayUnsafe(error))
      assert.deepEqual(attempts, [2])
    }
  }
})

test('expiring and double-card tasks only send valid unexpired inventory through the real allocation chain', async () => {
  for (const type of ['expiring-gift', 'double-card']) {
    const attempts = []
    const now = Date.now()
    const mocks = {
      './api': {
        getBackpackStatus: async () => ({
          rows: [{ giftId: 268, count: 50, expireTime: now - 1000 }, { giftId: 268, count: 3, expireTime: now + 3600000 }],
          totalRows: 2,
          glowStickCount: 53,
        }),
        getDid: async () => 'fixture',
        parseDyAndSidFromCookie: () => ({}),
        sleep: async () => {},
        sendGift: async (_args, job) => attempts.push({ ...job }),
      },
      './double-card': { checkDoubleCard: async () => ({ active: true }) },
    }
    const config = Object.freeze({
      enabled: true,
      allocationMode: 'fixed',
      roomAllocations: Object.freeze({ 1: Object.freeze({ count: 1 }), 2: Object.freeze({ count: -1 }) }),
      thresholdHours: 24,
      giftScope: 'limitedTime',
      participatingRoomIds: [1, 2],
    })
    const job = loadTypeScriptModule(`src/core/${type}-job.ts`, mocks)
    const execute = type === 'expiring-gift' ? job.executeExpiringGiftJob : job.executeDoubleCardJob
    await execute(config, '', () => {})
    assert.deepEqual(attempts.map(item => [item.roomId, item.giftId, item.count]), [[1, 268, 1], [2, 268, 2]])
  }
})
