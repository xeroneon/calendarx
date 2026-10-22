/**
 * CalendarX server bootstrap — thin CalDAV proxy app.
 */
import express, { type Express, type Request, type Response } from 'express'
import cors from 'cors'
import { pino } from 'pino'
import { pinoHttp } from 'pino-http'
import { authRouter } from './routes/auth.js'
import { authMiddleware, requireAuth } from './auth.js'
import { connectionRouter, calendarRouter, sweepAllSubscribedUsers } from './routes/calendar-and-connections.js'
import { pushRouter } from './routes/push.js'

const VERSION = '0.1.0'

function buildApp(silent = false): Express {
  const app = express()
  app.disable('x-powered-by')
  const requestLogger = silent ? pino({ enabled: false }) : pino()
  app.use(pinoHttp({ logger: requestLogger }))
  app.use(cors())
  app.use(express.json({ limit: '10mb' }))

  // Public health + info.
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      data: { service: 'server', name: 'calendarx', version: VERSION, status: 'ok' },
    })
  })

  // Account gate: /api/auth is public (signup/login), everything else gated.
  app.use('/api', authMiddleware)
  app.use('/api/auth', authRouter)
  app.use('/api/connections', requireAuth, connectionRouter)
  app.use('/api/calendar', requireAuth, calendarRouter)
  app.use('/api/push', requireAuth, pushRouter)

  // Central error handler — respond 500 JSON, never leak a stack.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: unknown) => {
    res.status(500).json({ ok: false, error: { code: 'server_error', message: err.message } })
  })

  return app
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 3101)
  const app = buildApp()
  // Load persisted accounts/sessions + CalDAV connections + push subscriptions
  // (all survive restarts).
  const { authStore } = await import('./auth.js')
  await authStore.load()
  const { connectionStore } = await import('./routes/calendar-and-connections.js')
  await connectionStore.load()
  const { pushSubscriptionStore } = await import('./push/registry.js')
  await pushSubscriptionStore.load()
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`calendarx server listening on :${port}`)
    // Re-arm reminders for every registered device from their CalDAV server.
    void sweepAllSubscribedUsers().catch((err) =>
      console.warn(`[push] boot sweep failed: ${(err as Error).message}`),
    )
  })
}

export { buildApp }