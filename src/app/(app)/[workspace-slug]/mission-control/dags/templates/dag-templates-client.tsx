'use client'

import { useCallback, useEffect, useState } from 'react'
import { Workflow, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CapabilityGate } from '@/components/mission-control/capability-gate'
import { EmptyState } from '@/components/mission-control/empty-state'
import { DagTemplateEditor } from '@/components/mission-control/dag/template-editor'
import { DagTemplateVisualizer } from '@/components/mission-control/dag/template-visualizer'
import type { DagSpec } from '@contracts/dag'

interface TemplateRow {
  id: string
  org_id: string | null
  slug: string
  name: string
  description: string | null
  version: number
  spec: DagSpec
  is_active: boolean
  created_at: string
}

interface DagTemplatesClientProps {
  orgId: string
}

type Mode =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'edit'; template: TemplateRow }

export function DagTemplatesClient({ orgId }: DagTemplatesClientProps) {
  return (
    <CapabilityGate
      capability="manage:orchestration"
      fallback={
        <div className="p-6">
          <EmptyState
            icon={<Workflow className="h-8 w-8" />}
            title="Workflow templates unavailable"
            description="Your plan does not include workflow template authoring. Upgrade to Pro to design and manage orchestration templates."
          />
        </div>
      }
    >
      <DagTemplatesInner orgId={orgId} />
    </CapabilityGate>
  )
}

function DagTemplatesInner({ orgId }: { orgId: string }) {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>({ kind: 'list' })

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dags/templates?orgId=${orgId}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        setTemplates([])
        return
      }
      const payload = (await res.json()) as { templates: TemplateRow[] }
      setTemplates(payload.templates ?? [])
    } catch {
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    void fetchTemplates()
  }, [fetchTemplates])

  const handleSaved = useCallback(async () => {
    await fetchTemplates()
    setMode({ kind: 'list' })
  }, [fetchTemplates])

  if (mode.kind === 'create') {
    return (
      <div className="p-4 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Workflow Template</h2>
        </div>
        <DagTemplateEditor
          orgId={orgId}
          onSaved={handleSaved}
          onCancel={() => setMode({ kind: 'list' })}
        />
      </div>
    )
  }

  if (mode.kind === 'edit') {
    return (
      <div className="p-4 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Edit template:{' '}
            <span className="font-mono text-sm">{mode.template.slug}</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DagTemplateEditor
            orgId={orgId}
            initial={{
              id: mode.template.id,
              slug: mode.template.slug,
              name: mode.template.name,
              description: mode.template.description,
              spec: mode.template.spec,
            }}
            onSaved={handleSaved}
            onCancel={() => setMode({ kind: 'list' })}
          />
          <div className="rounded-md border bg-muted/10" style={{ minHeight: 480 }}>
            <DagTemplateVisualizer spec={mode.template.spec} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Workflow Templates</h2>
          <p className="text-xs text-muted-foreground">
            Reusable orchestration templates for repeatable mission workflows.
          </p>
        </div>
        <Button size="sm" onClick={() => setMode({ kind: 'create' })}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          New template
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<Workflow className="h-8 w-8" />}
          title="No workflow templates yet"
          description="Author a template to define how repeatable missions should run."
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {templates.map((t) => {
            const isGlobal = t.org_id === null
            return (
              <li
                key={t.id}
                className="flex items-start justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{t.name}</span>
                    <span className="font-mono text-xs text-muted-foreground truncate">
                      {t.slug}
                    </span>
                    <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                      v{t.version}
                    </span>
                    {isGlobal && (
                      <span className="text-[10px] rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-500">
                        Global
                      </span>
                    )}
                    {!t.is_active && (
                      <span className="text-[10px] rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
                        Inactive
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {t.description}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t.spec.nodes.length} nodes - {t.spec.edges.length} edges
                  </p>
                </div>
                <div className="shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isGlobal}
                    onClick={() => setMode({ kind: 'edit', template: t })}
                  >
                    {isGlobal ? 'Read-only' : 'Edit'}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
