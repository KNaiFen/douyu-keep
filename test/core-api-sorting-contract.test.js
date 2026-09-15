const assert = require('node:assert/strict')
const { test } = require('node:test')
const { loadTypeScriptModule } = require('./helpers/typescript-module-loader')

function loadApiModule(axiosMock) {
  return loadTypeScriptModule('src/core/api.ts', { axios: axiosMock })
}

function fansRow({ name, roomId, level, rank, intimacy, today }) {
  return `<tr data-anchor_name="${name}" data-fans-room="${roomId}" data-fans-level="${level}" data-fans-rank="${rank}">
    <td>${name}</td><td>${roomId}</td><td>${intimacy}</td><td>${today}</td>
  </tr>`
}

test('getFansList sorts fans by current intimacy descending', async () => {
  const axiosMock = {
    get: async () => ({
      data: `<table class="fans-badge-list">
        <tr><th>name</th><th>room</th><th>intimacy</th><th>today</th></tr>
        ${fansRow({ name: 'high-level-low-intimacy', roomId: 1001, level: 30, rank: 1, intimacy: '10/999', today: 0 })}
        ${fansRow({ name: 'low-level-high-intimacy', roomId: 1002, level: 1, rank: 2, intimacy: '200/999', today: 0 })}
        ${fansRow({ name: 'middle', roomId: 1003, level: 10, rank: 3, intimacy: '50/999', today: 0 })}
      </table>`,
    }),
  }
  const { getFansList } = loadApiModule(axiosMock)

  const fans = await getFansList('cookie')

  assert.deepEqual(JSON.parse(JSON.stringify(fans.map(fan => fan.roomId))), [1002, 1003, 1001])
})

test('getBackpackStatus sorts backpack rows by count descending', async () => {
  const axiosMock = {
    get: async () => ({
      data: {
        error: 0,
        data: {
          list: [
            { id: 268, name: 'small', count: 1 },
            { id: 999, name: 'large', count: '9' },
            { id: 268, name: 'middle', count: 3 },
          ],
        },
      },
    }),
  }
  const { getBackpackStatus } = loadApiModule(axiosMock)

  const status = await getBackpackStatus('cookie')

  assert.deepEqual(JSON.parse(JSON.stringify(status.rows.map(row => row.count))), [9, 3, 1])
  assert.equal(status.glowStickCount, 4)
})
