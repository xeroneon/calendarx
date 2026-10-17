import { createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '~/components/AuthGate'
import { ConnectionScreen } from '~/components/connection/ConnectionScreen'

export const Route = createFileRoute('/connect')({
  component: () => (
    <AuthGate>
      <div className="cl-connect-wrap">
        <ConnectionScreen />
      </div>
    </AuthGate>
  ),
})