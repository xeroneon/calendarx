/**
 * CalendarX server bootstrap — thin CalDAV proxy app.
 */
import express, { type Express, type Request, type Response } from 'express'
import cors from 'cors'
import { pino } from 'pino'
import { pinoHttp } from 'pino-http'
import { connectionRouter, calendarRouter, defaultConnection } from './routes/calendar-and-connections.js'

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
      data: { service: 'server', name: 'calendax', version: VERSION, status: 'ok' },
    })
  })

  app.use('/api/connections', connectionRouter)
  app.use('/api/calendar', calendarRouter)

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
  // Surface whether the seed has a configured CalDAV backend at boot.
  void defaultConnection()
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`calendax server listening on :${port}`)
  })
}

export { buildApp }