import express from 'express'
import { createAuthHandlers } from './server-auth'
import { registerConfigRoutes } from './server-config-routes'
import { registerCookieSourceRoutes } from './server-cookie-source-routes'
import { registerFansRoutes } from './server-fans-routes'
import { registerTaskRoutes } from './server-task-routes'
import type { AppContext, JobStatus } from './server-types'
import { isDockerWebUiPagePath, registerWebUiRoutes } from './server-webui-routes'

export type { AppContext, JobStatus }

export function createServer(ctx: AppContext, options: { desktopToken?: string, isStopping?: () => boolean } = {}): express.Express {
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

  registerWebUiRoutes(app, ctx, Boolean(options.desktopToken))
  auth.registerAuthRoutes(app)
  auth.registerProtectedBoundary(app, isDockerWebUiPagePath)
  registerConfigRoutes(app, ctx)
  registerFansRoutes(app, ctx)
  registerCookieSourceRoutes(app, ctx)
  registerTaskRoutes(app, ctx)

  return app
}
