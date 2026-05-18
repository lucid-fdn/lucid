'use client'

/**
 * Key Audit Timeline Component
 * 
 * Read-only timeline of org_lucidgateway_key_audit_events:
 * - Shows actor, event type, timestamp, metadata
 * - Filters by key + event type
 * - Ordered by created_at DESC
 */

import { useCallback, useEffect, useState } from 'react'
import { Clock, Filter, Shield } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

interface AuditEvent {
  id: string
  org_id: string
  key_id: string | null
  event_type: string
  actor_user_id: string
  metadata: Record<string, unknown> | null
  created_at: string
}

interface KeyAuditTimelineProps {
  orgId: string
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  created: 'Key Created',
  rotated: 'Key Rotated',
  rotation_started: 'Rotation Started',
  rotation_completed: 'Rotation Completed',
  rotation_failed: 'Rotation Failed',
  revoked: 'Key Revoked',
  error: 'Error',
}

const EVENT_TYPE_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  created: 'default',
  rotated: 'secondary',
  rotation_started: 'outline',
  rotation_completed: 'default',
  rotation_failed: 'destructive',
  revoked: 'destructive',
  error: 'destructive',
}

export function KeyAuditTimeline({ orgId }: KeyAuditTimelineProps) {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filterKeyId, _setFilterKeyId] = useState<string>('all')
  const [filterEventType, setFilterEventType] = useState<string>('all')

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filterKeyId !== 'all') params.set('keyId', filterKeyId)
      if (filterEventType !== 'all') params.set('eventType', filterEventType)

      const res = await fetch(`/api/orgs/${orgId}/lucidgateway-keys/audit?${params}`)
      if (!res.ok) throw new Error('Failed to load audit events')
      const data = await res.json()
      setEvents(data.events || [])
    } catch (error) {
      console.error('Failed to load audit events:', error)
    } finally {
      setLoading(false)
    }
  }, [orgId, filterKeyId, filterEventType])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Audit Timeline</CardTitle>
          <CardDescription>Loading audit events...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Audit Timeline</CardTitle>
            <CardDescription>View all key lifecycle events for this organization</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filterEventType} onValueChange={setFilterEventType}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by event" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Events</SelectItem>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="rotated">Rotated</SelectItem>
                <SelectItem value="rotation_started">Rotation Started</SelectItem>
                <SelectItem value="rotation_completed">Rotation Completed</SelectItem>
                <SelectItem value="rotation_failed">Rotation Failed</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
                <SelectItem value="error">Errors</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No audit events found.
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-lg border p-3 text-sm"
              >
                <Shield className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={EVENT_TYPE_VARIANTS[event.event_type] || 'outline'}>
                      {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {Object.entries(event.metadata)
                        .filter(([key]) => !key.startsWith('_'))
                        .map(([key, value]) => (
                          <div key={key}>
                            <span className="font-medium">{key}:</span>{' '}
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <Clock className="h-3 w-3 text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}