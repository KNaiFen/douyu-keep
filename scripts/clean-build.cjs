const { rmSync } = require('node:fs')
const path = require('node:path')

rmSync(path.join(__dirname, '../build/docker'), { recursive: true, force: true })
