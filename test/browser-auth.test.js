const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadTypeScriptModule } = require('./helpers/typescript-module-loader')

async function mountAuth(t, href, failLogin = false) {
  const requests = []
  const replacements = []
  let mounted
  const oldWindow = globalThis.window
  const oldDocument = globalThis.document
  globalThis.window = {
    location: { href },
    history: {
      replaceState: (_state, _title, url) => {
        replacements.push(url)
        globalThis.window.location.href = new URL(url, href).href
      },
    },
  }
  globalThis.document = {
    dispatchEvent: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  t.after(() => {
    if (oldWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = oldWindow
    }
    if (oldDocument === undefined) {
      delete globalThis.document
    } else {
      globalThis.document = oldDocument
    }
  })
  const { useAuthSession } = loadTypeScriptModule('src/docker/webui/auth.ts', {
    'vue': {
      ref: value => ({ value }),
      watch: () => {},
      onBeforeUnmount: () => {},
      onMounted: (callback) => {
        mounted = callback
      },
    },
    './request': {
      UNAUTHORIZED_EVENT_NAME: 'unauthorized',
      requestJson: async (url, options) => {
        requests.push({ url, options, browserUrl: globalThis.window.location.href })
        if (failLogin) {
          throw new Error('offline')
        }
        return { authenticated: false }
      },
    },
    './toast': { showToast: () => {} },
  })
  const state = useAuthSession({ clearProtectedState: () => {}, loadProtectedData: async () => {} })
  mounted()
  await new Promise(resolve => setImmediate(resolve))
  return { state, requests, replacements }
}

test('fragment password takes priority and both password locations disappear before login', async (t) => {
  const { requests, replacements } = await mountAuth(t, 'http://127.0.0.1:12345/Logs?web-password=old&tab=logs#web-password=new%2Bvalue&section=recent')
  assert.deepEqual(replacements, ['/Logs?tab=logs#section=recent'])
  assert.equal(requests[0].url, '/api/auth/login')
  assert.deepEqual(JSON.parse(requests[0].options.body), { password: 'new+value' })
  assert.equal(requests[0].browserUrl, 'http://127.0.0.1:12345/Logs?tab=logs#section=recent')
})

test('legacy query login remains supported and unrelated hash is preserved', async (t) => {
  const { requests, replacements } = await mountAuth(t, 'http://127.0.0.1:12345/?web-password=legacy#overview')
  assert.deepEqual(replacements, ['/#overview'])
  assert.deepEqual(JSON.parse(requests[0].options.body), { password: 'legacy' })
})

test('fragment secret is removed even when login fails', async (t) => {
  const { state, requests, replacements } = await mountAuth(t, 'http://127.0.0.1:12345/#web-password=synthetic', true)
  assert.deepEqual(replacements, ['/'])
  assert.equal(requests[0].browserUrl, 'http://127.0.0.1:12345/')
  assert.equal(state.authenticated.value, false)
  assert.match(state.loginError.value, /offline/)
})

test('empty fragment password overrides query without sending either credential', async (t) => {
  const { state, requests, replacements } = await mountAuth(t, 'http://127.0.0.1:12345/?web-password=legacy#web-password=')
  assert.deepEqual(replacements, ['/'])
  assert.deepEqual(requests, [])
  assert.equal(state.loginError.value, '请输入密码')
})

test('ordinary URLs retain history and use the existing session status', async (t) => {
  const { requests, replacements } = await mountAuth(t, 'http://127.0.0.1:12345/Logs#recent')
  assert.deepEqual(replacements, [])
  assert.equal(requests[0].url, '/api/auth/status')
})
