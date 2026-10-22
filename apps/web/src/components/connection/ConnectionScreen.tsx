import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Field,
  Select,
  TextField,
} from '@calendarx/ui'
import type { CalDavConnection } from '@calendarx/sdk'
import { authCall } from '~/lib/auth-call'
import {
  AUTH_MODES,
  authModeInfo,
  type AuthMode,
  parseServerInput,
  describeProbe,
  type AuthModeInfo,
} from '~/lib/connections'
import { saveConnection, testConnection } from '~/server/connections'
import { useConnectionStatus } from '~/hooks/useConnectionStatus'
import { PushStatusRow } from '~/components/connection/PushStatusRow'

/**
 * First-run + settings "add your CalDAV server" surface (XER-310). Collects a
 * CalDAV principal URL, auth mode and credentials, live-probes it via
 * `POST /api/connections/test`, saves via `POST /api/connections`, then shows
 * the discovered calendars and jumps into the calendar. The browser never holds
 * the upstream password — the thin server stores the connection.
 */
export function ConnectionScreen(): React.ReactElement {
  const status = useConnectionStatus()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [adding, setAdding] = React.useState(status.state === 'empty')
  const [saved, setSaved] = React.useState<{ conn: CalDavConnection; calendars?: string[] } | null>(null)

  const onSaved = (conn: CalDavConnection, calendars?: string[]): void => {
    setSaved({ conn, calendars })
    void qc.refetchQueries({ queryKey: ['connections'] })
    void qc.invalidateQueries({ queryKey: ['calendar'] })
  }

  if (status.state === 'loading') {
    return (
      <Card variant="raised" elevated className="cl-connect-card">
        <CardBody>
          <div className="cl-muted">Loading…</div>
        </CardBody>
      </Card>
    )
  }

  // Just saved — show the discovered calendars and a path into the calendar.
  if (saved) {
    return (
      <SavedPanel
        label={saved.conn.name || 'Home Calendar'}
        url={saved.conn.principalUrl}
        calendars={saved.calendars}
        onOpen={() => void navigate({ to: '/calendar' })}
      />
    )
  }

  // First-run (no connection) always drops straight into the add form.
  if (status.state === 'empty') {
    return <ConnectionForm key="fresh" onSaved={onSaved} />
  }

  // Settings mode — show the active connection unless the user is changing it.
  if (adding) {
    return <ConnectionForm key={status.connection.id} initial={status.connection} onSaved={onSaved} onCancel={() => setAdding(false)} />
  }

  const conn = status.connection
  const info = authModeInfo(conn.auth)
  return (
    <Card variant="raised" elevated className="cl-connect-card">
      <CardHeader
        title="Connected"
        description="Your CalDAV server is configured and stored on the server (never the browser)."
        action={
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            Change server
          </Button>
        }
      />
      <CardBody>
        <SummaryRow label={conn.name || 'Home Calendar'} badge="Active" sub={conn.principalUrl} />
        <SummaryRow label={info.label} sub={info.hint} />
        <PushStatusRow />
      </CardBody>
      <CardFooter align="right">
        <Button variant="primary" onClick={() => void navigate({ to: '/calendar' })}>
          Open calendar
        </Button>
      </CardFooter>
    </Card>
  )
}

function SummaryRow({ label, sub, badge }: { label: string; sub: string; badge?: string }): React.ReactElement {
  return (
    <div className="cl-conn-row">
      <div className="cl-conn-row-label">
        {label}
        {badge ? <span className="cl-badge">{badge}</span> : null}
      </div>
      <div className="cl-conn-row-sub">{sub}</div>
    </div>
  )
}

function SavedPanel({
  label,
  url,
  calendars,
  onOpen,
}: {
  label: string
  url: string
  calendars?: string[]
  onOpen: () => void
}): React.ReactElement {
  return (
    <Card variant="raised" elevated className="cl-connect-card">
      <CardHeader title="Saved" description={`Connected to ${label} (${url}).`} />
      <CardBody>
        {calendars && calendars.length > 0 ? (
          <>
            <div className="cl-connect-saved-title">Found {calendars.length} calendar{calendars.length === 1 ? '' : 's'}:</div>
            <ul className="cl-connect-cals">
              {calendars.map((c) => (
                <li key={c}>• {c}</li>
              ))}
            </ul>
          </>
        ) : (
          <div className="cl-connect-saved-title">Connection saved. Your calendars will appear in the picker.</div>
        )}
      </CardBody>
      <CardFooter align="right">
        <Button variant="primary" onClick={onOpen}>
          Jump into your calendar →
        </Button>
      </CardFooter>
    </Card>
  )
}

interface ConnectionFormProps {
  /** Prefill when the user is changing an existing connection. */
  initial?: CalDavConnection
  onSaved: (conn: CalDavConnection, calendars?: string[]) => void
  onCancel?: () => void
}

function ConnectionForm({ initial, onSaved, onCancel }: ConnectionFormProps): React.ReactElement {
  const [name, setName] = React.useState(initial?.name ?? '')
  const [url, setUrl] = React.useState(initial?.principalUrl ?? '')
  const [auth, setAuth] = React.useState<AuthMode>(initial?.auth ?? 'basic')
  const [username, setUsername] = React.useState('')
  const [secret, setSecret] = React.useState('')
  const [formErr, setFormErr] = React.useState<string | null>(null)

  const info: AuthModeInfo = authModeInfo(auth)

  const testMut = useMutation({
    mutationFn: (d: { url: string; auth: AuthMode; username?: string; password?: string }) =>
      authCall(() => testConnection({ data: d })),
  })
  const saveMut = useMutation({
    mutationFn: (d: { name?: string; principalUrl: string; auth: AuthMode; username?: string; password?: string }) =>
      authCall(() => saveConnection({ data: d })),
    onSuccess: (conn) => onSaved(conn, testMut.data?.ok ? testMut.data.calendars : undefined),
  })

  const submitTest = (e: React.FormEvent): void => {
    e.preventDefault()
    setFormErr(null)
    const parsed = parseServerInput(url)
    if (!parsed.ok) {
      setFormErr(parsed.error)
      return
    }
    testMut.mutate({ url: parsed.url, auth, username: info.needsUsername ? username : undefined, password: secret || undefined })
  }

  const submitSave = (e: React.FormEvent): void => {
    e.preventDefault()
    setFormErr(null)
    const parsed = parseServerInput(url)
    if (!parsed.ok) {
      setFormErr(parsed.error)
      return
    }
    saveMut.mutate({
      name: name.trim() || undefined,
      principalUrl: parsed.url,
      auth,
      username: info.needsUsername ? username : undefined,
      password: secret || undefined,
    })
  }

  const feedback = testMut.isError
    ? describeProbe(testMut.error)
    : testMut.data
      ? describeProbe(testMut.data)
      : null

  return (
    <Card variant="raised" elevated className="cl-connect-card">
      <CardHeader
        title="Add your CalDAV server"
        description="CalendarX stores the connection server-side — your password never touches the browser."
      />
      <form onSubmit={submitSave}>
        <CardBody>
          <div className="cl-connect-form">
            <Field label="Server name" hint="Optional — a friendly label for this connection.">
              <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder="Home Calendar" autoComplete="off" />
            </Field>
            <Field
              label="Server URL"
              required
              error={formErr ?? undefined}
              hint="CalDAV principal URL — e.g. https://server.example/remote.php/dav"
            >
              <TextField
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://server.example/remote.php/dav"
                mono
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Auth mode">
              <Select value={auth} onChange={(e) => setAuth(e.target.value as AuthMode)}>
                {AUTH_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <div className="cl-muted cl-field-hint">{info.hint}</div>
            </Field>
            {info.needsUsername ? (
              <Field label="Username">
                <TextField value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoComplete="username" />
              </Field>
            ) : null}
            <Field label={info.credentialLabel} hint="Sent only to your server during the probe; stored server-side on save.">
              <TextField
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={info.credentialLabel.toLowerCase()}
                autoComplete="current-password"
              />
            </Field>
          </div>

          {feedback ? (
            <div className={`cl-connect-feedback ${feedback.tone === 'ok' ? 'ok' : 'err'}`} role={feedback.tone === 'err' ? 'alert' : 'status'}>
              {feedback.message}
            </div>
          ) : null}
        </CardBody>
        <CardFooter align="space-between">
          <div className="cl-connect-footer-left">
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </div>
          <div className="cl-connect-footer-right">
            <Button type="button" variant="outline" loading={testMut.isPending} onClick={submitTest}>
              {testMut.isPending ? 'Testing…' : 'Test connection'}
            </Button>
            <Button type="submit" variant="primary" loading={saveMut.isPending} disabled={!testMut.data?.ok}>
              {saveMut.isPending ? 'Saving…' : 'Save & open calendar'}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}