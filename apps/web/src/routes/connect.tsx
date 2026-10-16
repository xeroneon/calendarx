import { createFileRoute } from '@tanstack/react-router'
import { ConnectionScreen } from '~/components/connection/ConnectionScreen'

export const Route = createFileRoute('/connect')({
  component: () => (
    <div className="cl-connect-wrap">
      <ConnectionScreen />
    </div>
  ),
})