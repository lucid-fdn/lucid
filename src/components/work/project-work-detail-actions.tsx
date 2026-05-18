'use client'

import React from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, MessageSquarePlus, PlayCircle, ShieldCheck, ShieldX } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'

const WORK_GRAPH_AGENT_OPS_WORKFLOWS = [
  { id: 'investigate', label: 'Investigate' },
  { id: 'review', label: 'Review' },
  { id: 'qa', label: 'QA' },
  { id: 'ship', label: 'Ship' },
  { id: 'autoplan', label: 'Autoplan' },
] as const

export function ProjectWorkDetailActions({
  orgId,
  projectId,
  itemId,
  status,
  hasApprovalBridge,
  hasActiveCheckout = false,
}: {
  orgId: string
  projectId: string
  itemId: string
  status: string
  hasApprovalBridge: boolean
  hasActiveCheckout?: boolean
}) {
  const router = useRouter()
  const [comment, setComment] = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [resolvingAs, setResolvingAs] = useState<'approved' | 'rejected' | 'completed' | null>(null)
  const [launchingAgentOps, setLaunchingAgentOps] = useState(false)
  const [agentOpsWorkflow, setAgentOpsWorkflow] = useState<(typeof WORK_GRAPH_AGENT_OPS_WORKFLOWS)[number]['id']>('investigate')

  const canResolve = useMemo(
    () => ['open', 'in_progress', 'waiting'].includes(status),
    [status],
  )

  const addComment = async () => {
    const body = comment.trim()
    if (!body) return

    setSubmittingComment(true)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/orgs/${orgId}/work-items/${itemId}/comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({ body }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to add comment')
        return
      }

      setComment('')
      toast.success('Comment added')
      router.refresh()
    } catch {
      toast.error('Network error while adding comment')
    } finally {
      setSubmittingComment(false)
    }
  }

  const launchAgentOps = async () => {
    setLaunchingAgentOps(true)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/workspaces/${orgId}/projects/${projectId}/work-graph/items/${itemId}/agent-ops`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          workflow_id: agentOpsWorkflow,
          purpose: `Agent Ops ${agentOpsWorkflow} execution`,
          lease_seconds: 60 * 60 * 24,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to launch Agent Ops')
        return
      }

      toast.success('Agent Ops run launched')
      router.refresh()
    } catch {
      toast.error('Network error while launching Agent Ops')
    } finally {
      setLaunchingAgentOps(false)
    }
  }

  const resolveWorkItem = async (resolution: 'approved' | 'rejected' | 'completed') => {
    setResolvingAs(resolution)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/orgs/${orgId}/work-items/${itemId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          resolution,
          resolution_notes: resolutionNotes.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to resolve work item')
        return
      }

      setResolutionNotes('')
      toast.success(
        resolution === 'approved'
          ? 'Work item approved'
          : resolution === 'rejected'
            ? 'Work item rejected'
            : 'Work item completed',
      )
      router.refresh()
    } catch {
      toast.error('Network error while resolving work item')
    } finally {
      setResolvingAs(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border p-3">
        <div className="space-y-1">
          <Label htmlFor="work-agent-ops-workflow">Agent Ops</Label>
          <p className="text-xs text-muted-foreground">
            Start execution from this work item. Work Graph will hold the checkout and attach run evidence back here.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Select value={agentOpsWorkflow} onValueChange={(value) => setAgentOpsWorkflow(value as typeof agentOpsWorkflow)}>
            <SelectTrigger id="work-agent-ops-workflow" className="w-full">
              <SelectValue placeholder="Choose workflow" />
            </SelectTrigger>
            <SelectContent>
              {WORK_GRAPH_AGENT_OPS_WORKFLOWS.map((workflow) => (
                <SelectItem key={workflow.id} value={workflow.id}>
                  {workflow.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            onClick={launchAgentOps}
            disabled={launchingAgentOps || hasActiveCheckout}
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            {launchingAgentOps ? 'Launching...' : 'Launch'}
          </Button>
        </div>
        {hasActiveCheckout ? (
          <p className="text-xs text-muted-foreground">Release the active checkout before launching another Agent Ops run.</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="work-comment">Discussion</Label>
        <Textarea
          id="work-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={4}
          maxLength={10000}
          placeholder="Add context, handoff notes, or a decision trail for the next operator."
        />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={addComment}
            disabled={submittingComment || comment.trim().length === 0}
          >
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            {submittingComment ? 'Saving comment...' : 'Add comment'}
          </Button>
        </div>
      </div>

      {canResolve ? (
        <div className="space-y-3 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="work-resolution-notes">Resolution notes</Label>
            <Textarea
              id="work-resolution-notes"
              value={resolutionNotes}
              onChange={(event) => setResolutionNotes(event.target.value)}
              rows={3}
              maxLength={10000}
              placeholder="Optional rationale, approval notes, or completion summary."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {hasApprovalBridge ? (
              <>
                <Button
                  type="button"
                  onClick={() => resolveWorkItem('approved')}
                  disabled={Boolean(resolvingAs)}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  {resolvingAs === 'approved' ? 'Approving...' : 'Approve'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resolveWorkItem('rejected')}
                  disabled={Boolean(resolvingAs)}
                >
                  <ShieldX className="mr-2 h-4 w-4" />
                  {resolvingAs === 'rejected' ? 'Rejecting...' : 'Reject'}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={() => resolveWorkItem('completed')}
                disabled={Boolean(resolvingAs)}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {resolvingAs === 'completed' ? 'Completing...' : 'Mark completed'}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
