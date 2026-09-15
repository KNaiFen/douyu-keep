const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const { EventEmitter } = require('node:events')
const test = require('node:test')
const { loadTypeScriptModule } = require('./helpers/typescript-module-loader')

function collectHarness() {
  let socket
  class FakeSocket extends EventEmitter {
    constructor() {
      super()
      socket = this
      this.sent = []
    }

    send(packet) {
      this.sent.push(packet)
    }

    close() {}
  }
  const { collectGiftViaDanmu } = loadTypeScriptModule('src/core/collect-gift.ts', { ws: FakeSocket })
  const pending = collectGiftViaDanmu('', 42)
  socket.emit('open')
  return { socket, pending }
}

test('collection rejects roomgroup 10 instead of treating it as authenticated group 1', async () => {
  const { socket, pending } = collectHarness()
  socket.emit('message', Buffer.from('type@=loginres/roomgroup@=10/\0type@=h5ckres/\0'))
  await assert.rejects(pending, /鉴权失败/)
  assert.equal(socket.sent.length, 1)
})

test('collection does not accept unsolicited completion or process frames after settlement', async () => {
  const { socket, pending } = collectHarness()
  socket.emit('message', Buffer.from('type@=h5ckres/\0type@=loginres/roomgroup@=1/\0'))
  socket.emit('close')
  await assert.rejects(pending)
  assert.equal(socket.sent.length, 1)
})

test('collection enters once and accepts completion only after authenticated login', async () => {
  const { socket, pending } = collectHarness()
  socket.emit('message', Buffer.from('type@=loginres/roomgroup@=1/\0type@=loginres/roomgroup@=1/\0type@=h5ckres/\0'))
  await pending
  assert.equal(socket.sent.length, 2)
})

const mainCookie = 'acf_uid=test; acf_biz=test; acf_stk=test; acf_ct=test; acf_ltkid=test'

function yubaHarness(signResponse, groups = [{ groupId: 1, name: 'test' }]) {
  const delays = []
  const { executeFollowedYubaCheckInWithDyToken } = loadTypeScriptModule('src/core/yuba-check-in.ts', {
    './api': {
      ...loadTypeScriptModule('src/core/api.ts'),
      sleep: async ms => delays.push(ms),
    },
    './yuba-status': { getFollowedYubaGroupsWithDyToken: async () => groups },
    axios: { post: async url => ({ data: url.endsWith('/sign') ? signResponse : { status_code: 200, error: 0, data: 0 } }) },
  })
  return { run: () => executeFollowedYubaCheckInWithDyToken('', mainCookie, () => {}), delays }
}

test('Yuba explicit failure codes cannot become success through empty messages and object data', async () => {
  for (const response of [{ status_code: 500, data: {} }, { status_code: 200, error: 500, msg: '签到成功', data: {} }]) {
    const { run } = yubaHarness(response)
    const result = await run()
    assert.equal(result.signedCount, 0)
    assert.equal(result.failedCount, 1)
  }
})

test('closed Yuba groups retain the interval before the next group', async () => {
  const { run, delays } = yubaHarness({ status_code: 404, msg: '鱼吧不存在' }, [{ groupId: 1 }, { groupId: 2 }])
  await run()
  assert.equal(delays.length, 1)
  assert.ok(delays[0] >= 5000 && delays[0] <= 8000)
})

test('Yuba job reports incomplete execution without requesting whole-task credential replay', async () => {
  for (const result of [
    { signedCount: 1, alreadySignedCount: 0, failedCount: 1, stoppedEarly: false },
    { signedCount: 0, alreadySignedCount: 0, failedCount: 0, stoppedEarly: true },
  ]) {
    const { executeYubaCheckInJob } = loadTypeScriptModule('src/core/yuba-check-in-job.ts', {
      './yuba': {
        formatYubaModeLabel: () => 'test',
        executeFollowedYubaCheckInWithDyToken: async () => result,
      },
    })
    await assert.rejects(executeYubaCheckInJob({ mode: 'followed' }, '', '', () => {}), (error) => {
      assert.match(error.message, /执行不完整/)
      assert.doesNotMatch(error.message, /Cookie|登录|token|凭证/)
      return true
    })
  }
})
