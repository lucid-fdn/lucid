import type { WorkItemEvent } from '@/lib/db/human-work-items'
import type { HumanWorkItem, DagContextForWorkItem } from '@/lib/db/human-work-items'
import type { FeedEvent } from '@/lib/mission-control/types'
import type { WorkItemSignal } from '@/lib/work-items/signals'

export interface WorkArtifactSummary {
  id: string
  title: string
  summary: string
  kind: string
}

export function describeWorkItemBlocker(
  item: Pick<HumanWorkItem, 'status' | 'kind' | 'external_mirror'>,
  dagContext: DagContextForWorkItem | null,
  signal?: WorkItemSignal | null,
): string {
  const approvalId =
    item.external_mirror &&
    typeof item.external_mirror === 'object' &&
    typeof (item.external_mirror as Record<string, unknown>).approval_id === 'string'
      ? ((item.external_mirror as Record<string, unknown>).approval_id as string)
      : null

  if (approvalId) {
    return 'This work item is mirrored to an approval gate. Resolving it here will also resolve the linked approval.'
  }

  if (item.kind === 'nerve_node' && dagContext?.downstreamBlockedCount) {
    return `${dagContext.downstreamBlockedCount} downstream node${dagContext.downstreamBlockedCount === 1 ? '' : 's'} remain blocked until this task is resolved.`
  }

  if (signal && signal.state !== 'ready') {
    return signal.detail
  }

  if (item.status === 'waiting') {
    return 'This work item is waiting on prior execution context or operator input before it can move forward.'
  }

  if (item.status === 'in_progress') {
    return 'This work item is already claimed and needs a final operator decision to unblock the rest of the project.'
  }

  return 'This work item is ready for operator action.'
}

export function describeWorkItemEvent(ev: WorkItemEvent): string {
  if (ev.event_type === 'commented') {
    const body = (ev.payload as { body?: string })?.body
    return body ?? '(no text)'
  }

  if (ev.event_type === 'resolved') {
    const { resolution, resolution_notes } = ev.payload as {
      resolution?: string
      resolution_notes?: string | null
    }
    return `${resolution ?? 'resolved'}${resolution_notes ? ` - ${resolution_notes}` : ''}`
  }

  if (ev.event_type === 'assigned') {
    const uid = (ev.payload as { assignee_user_id?: string })?.assignee_user_id
    return uid ? `Assigned to ${uid.slice(0, 8)}` : 'Assignment updated'
  }

  if (ev.event_type === 'patched') {
    const patch = (ev.payload as { patch?: Record<string, unknown> })?.patch
    return patch ? `Updated ${Object.keys(patch).join(', ')}` : 'Work item updated'
  }

  if (ev.event_type === 'cancelled') {
    const reason = (ev.payload as { reason?: string | null })?.reason
    return reason ? `Cancelled - ${reason}` : 'Work item cancelled'
  }

  return 'Activity recorded'
}

function truncate(value: unknown, length = 160) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text) return ''
  return text.length > length ? `${text.slice(0, length - 3)}...` : text
}

export function extractRunArtifacts(events: FeedEvent[]): WorkArtifactSummary[] {
  const artifacts: WorkArtifactSummary[] = []

  for (const event of events) {
    const payload = (event.payload ?? {}) as Record<string, unknown>

    if (typeof payload.tool_output === 'string' && payload.tool_output.trim()) {
      artifacts.push({
        id: `${event.id}-tool-output`,
        title: String(payload.tool_name ?? 'Tool output'),
        summary: truncate(payload.tool_output),
        kind: 'tool_output',
      })
    } else if (typeof payload.message_text === 'string' && payload.message_text.trim()) {
      artifacts.push({
        id: `${event.id}-message`,
        title: 'Message',
        summary: truncate(payload.message_text),
        kind: 'message',
      })
    } else if (payload.receipt_id || payload.tx_hash) {
      artifacts.push({
        id: `${event.id}-receipt`,
        title: 'Receipt',
        summary: truncate(payload.receipt_id ?? payload.tx_hash),
        kind: 'receipt',
      })
    } else if (payload.result || payload.output) {
      artifacts.push({
        id: `${event.id}-result`,
        title: 'Result',
        summary: truncate(payload.result ?? payload.output),
        kind: 'result',
      })
    }
  }

  return artifacts.slice(0, 8)
}
