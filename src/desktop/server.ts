import path from 'node:path'
import process from 'node:process'
import { startDockerRuntime } from '../docker/runtime'

const dataDir = process.env.DOUYU_KEEP_DATA_DIR
const token = process.env.DOUYU_KEEP_LAUNCHER_TOKEN
let running: Awaited<ReturnType<typeof startDockerRuntime>> | undefined
if (!dataDir || !token) {
  throw new Error('请通过 douyu-keep.exe 启动程序')
}

void startDockerRuntime({
  configPath: path.join(dataDir, 'config.json'),
  webHost: '127.0.0.1',
  webPort: 0,
  webPassword: token,
  desktopToken: token,
  handleSignals: true,
  onShutdown: () => {
    const timeout = setTimeout(() => process.exit(1), 30_000)
    timeout.unref()
    void running?.close().then(() => process.exit(0), () => process.exit(1))
  },
}).then((handle) => {
  running = handle
  console.log(JSON.stringify({ desktopReady: true, url: handle.url }))
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
