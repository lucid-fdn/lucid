'use client'

import React from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { buildProjectWorkDetailPath } from '@/lib/projects/urls'

interface WorkAgentOption {
  id: string
  name: string
}

export function ProjectWorkComposer({
  orgId,
  workspaceSlug,
  projectSlug,
  agents,
  triggerLabel = 'Create work item',
  autoOpen = false,
  initialSelectedAgentId,
  source,
}: {
  orgId: string
  workspaceSlug: string
  projectSlug: string
  agents: WorkAgentOption[]
  triggerLabel?: string
  autoOpen?: boolean
  initialSelectedAgentId?: string | null
  source?: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(autoOpen)
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'high' | 'normal'>('normal')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(initialSelectedAgentId ?? agents[0]?.id ?? null)

  const canSubmit = useMemo(
    () => title.trim().length > 0 && Boolean(selectedAgentId),
    [selectedAgentId, title],
  )

  const reset = () => {
    setTitle('')
    setDescription('')
    setPriority('normal')
    setSelectedAgentId(initialSelectedAgentId ?? agents[0]?.id ?? null)
  }

  const handleSubmit = async () => {
    if (!canSubmit || !selectedAgentId) return

    setSubmitting(true)
    try {
      const csrf = getCSRFTokenFromCookie()
      const res = await fetch(`/api/orgs/${orgId}/work-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
        },
        body: JSON.stringify({
          pulse_job_run_id: `manual-${crypto.randomUUID()}`,
          title: title.trim(),
          description: description.trim() || null,
          priority,
          agent_id: selectedAgentId,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to create work item')
        return
      }

      const data = await res.json()
      const workItemId = data.workItem?.id
      if (!workItemId) {
        toast.error('Work item created but response was incomplete')
        return
      }

      toast.success('Work item created')
      setOpen(false)
      reset()
      const detailPath = buildProjectWorkDetailPath(workspaceSlug, projectSlug, workItemId)
      router.push(
        source === 'create-agent'
          ? `${detailPath}?source=create-agent`
          : detailPath,
      )
      router.refresh()
    } catch {
      toast.error('Network error while creating work item')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={agents.length === 0}>
          <PlusCircle className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create work item</DialogTitle>
          <DialogDescription>
            Turn intent into an operator-visible work item tied to one project agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="work-item-title">Title</Label>
            <Input
              id="work-item-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Investigate the latest onboarding failure"
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="work-item-description">Description</Label>
            <Textarea
              id="work-item-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              maxLength={20000}
              placeholder="Optional context, acceptance criteria, or escalation notes."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Agent</Label>
              <Select value={selectedAgentId ?? undefined} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as 'high' | 'normal')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? 'Creating...' : 'Create work item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
