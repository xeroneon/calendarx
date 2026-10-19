import { createFileRoute, Navigate, useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Card, CardBody, CardFooter, CardHeader, Field, TextField } from '@calendarx/ui'
import { useAuth } from '~/hooks/useAuth'
import { login, signup } from '~/server/auth'

export const Route = createFileRoute('/login')({
  component: () => <LoginScreen />,
})

/** Account gate entry: sign in to an existing account or create one. */
function LoginScreen(): React.ReactElement {
  const auth = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [mode, setMode] = React.useState<'login' | 'signup'>('login')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [formErr, setFormErr] = React.useState<string | null>(null)

  const submit = useMutation({
    mutationFn: () => (mode === 'login' ? login({ data: { email, password } }) : signup({ data: { email, password } })),
    onSuccess: (res) => {
      if (!res.ok) {
        setFormErr(res.error ?? 'Something went wrong.')
        return
      }
      void qc.invalidateQueries({ queryKey: ['auth'] })
      void qc.invalidateQueries({ queryKey: ['connections'] })
      void navigate({ to: '/' })
    },
    onError: () => setFormErr('Could not reach the server.'),
  })

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    setFormErr(null)
    if (!email.trim() || !password) {
      setFormErr('Email and password are required.')
      return
    }
    submit.mutate()
  }

  // Already signed in → skip the gate.
  if (auth.state === 'authed') return <Navigate to="/" />
  if (auth.state === 'loading') return <div className="cl-empty">Loading…</div>
  const isLogin = mode === 'login'

  return (
    <div className="cl-auth-wrap">
      <Card variant="raised" elevated className="cl-auth-card">
        <CardHeader
          title={isLogin ? 'Sign in' : 'Create your account'}
          description="CalendarX stores your CalDAV connection on your account — every device signs in to see its own calendar."
        />
        <form onSubmit={onSubmit}>
          <CardBody>
            <div className="cl-connect-form">
              <Field label="Email" required>
                <TextField
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  spellCheck={false}
                />
              </Field>
              <Field label="Password" required hint={isLogin ? undefined : 'At least 8 characters.'}>
                <TextField
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
              </Field>
              {formErr ? (
                <div className="cl-connect-feedback err" role="alert">
                  {formErr}
                </div>
              ) : null}
            </div>
          </CardBody>
          <CardFooter align="space-between">
            <div className="cl-connect-footer-left">
              <Button type="button" variant="ghost" onClick={() => setMode(isLogin ? 'signup' : 'login')}>
                {isLogin ? 'Create an account instead' : 'Sign in instead'}
              </Button>
            </div>
            <div className="cl-connect-footer-right">
              <Button type="submit" variant="primary" loading={submit.isPending}>
                {isLogin ? 'Sign in' : 'Create account'}
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}