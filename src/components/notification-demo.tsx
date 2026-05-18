'use client'

import { useToast } from '@/hooks/use-toast'
import { Button } from './button'

export default function NotificationDemo() {
  const toast = useToast()

  return (
    <div className="p-8 space-y-4">
      <h2 className="text-2xl font-bold mb-6">Notification System Demo</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Button
          onClick={() => toast.success('This is a success notification.')}
          color="blue"
        >
          Success
        </Button>

        <Button
          onClick={() => toast.error('This is an error notification.')}
          color="red"
        >
          Error
        </Button>

        <Button
          onClick={() => toast.warning('This is a warning notification.')}
          color="yellow"
        >
          Warning
        </Button>

        <Button
          onClick={() => toast.info('This is an info notification.')}
          color="blue"
        >
          Info
        </Button>
      </div>
    </div>
  )
}
