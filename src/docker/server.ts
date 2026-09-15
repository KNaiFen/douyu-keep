import express from 'express'
import { createAuthHandlers } from './server-auth'
import { registerConfigRoutes } from './server-config-routes'
import { registerCookieSourceRoutes } from './server-cookie-source-routes'
import { registerFansRoutes } from './server-fans-routes'
import { registerTaskRoutes } from './server-task-routes'
import type { AppContext, JobStatus } from './server-types'
import { isDockerWebUiPagePath, registerWebUiRoutes } from './server-webui-routes'

export type { AppContext, JobStatus }

export function createServer(ctx: AppContext, options: { desktopToken?: string, isStopping?: () => boolean, onShutdown?: () => void } = {}): express.Express {
  const app = express()
  const auth = createAuthHandlers(ctx, options.desktopToken)

  app.use((_req, res, next) => {
    if (options.isStopping?.()) {
      res.status(503).json({ error: '程序正在退出' })
      return
    }
    next()
  })
  app.use(express.json())

  if (options.desktopToken && options.onShutdown) {
    app.post('/api/desktop/shutdown', (req, res) => {
      if (req.get('X-Douyu-Desktop-Token') !== options.desktopToken) {
        res.status(403).json({ error: '只允许本机启动器退出服务' })
        return
      }
      res.json({ ok: true })
      options.onShutdown?.()
    })
  }
  registerWebUiRoutes(app, ctx)
  auth.registerAuthRoutes(app)
  auth.registerProtectedBoundary(app, isDockerWebUiPagePath)
  registerConfigRoutes(app, ctx)
  registerFansRoutes(app, ctx)
  registerCookieSourceRoutes(app, ctx)
  registerTaskRoutes(app, ctx)

  return app
}
