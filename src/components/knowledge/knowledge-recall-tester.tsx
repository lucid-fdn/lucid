'use client'

import { useEffect, useState } from 'react'
import { Loader2, SearchCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buildClientMutationHeaders } from '@/lib/auth/client-request'
import type { KnowledgeRecallPreview } from '@/features/knowledge-manager/types'

export function KnowledgeRecallTester({
  orgId,
  projectId,
  initialQuery = '',
}: {
  orgId: string
  projectId?: string | null
  initialQuery?: string
}) {
  const [query, setQuery] = useState(initialQuery)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<KnowledgeRecallPreview | null>(null)

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  async function testRecall(nextQuery = query) {
    if (!nextQuery.trim()) return
    setBusy(true)
    try {
      const response = await fetch('/api/knowledge/test-recall', {
        method: 'POST',
        headers: buildClientMutationHeaders(),
        body: JSON.stringify({
          org_id: orgId,
          project_id: projectId ?? null,
          query: nextQuery.trim(),
          channel_type: 'web',
          runtime: 'shared',
          engine: 'shared',
          proof_mode: 'optional',
        }),
      })
      if (!response.ok) throw new Error('Recall test failed')
      const body = await response.json()
      setPreview(body.preview)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test recall</CardTitle>
        <CardDescription>
          Ask what an agent should know. Lucid shows the facts and documents it would provide before the agent answers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="knowledge-recall-query">Question</Label>
          <div className="mt-2 flex gap-2">
            <Input
              id="knowledge-recall-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void testRecall()
              }}
              placeholder="What is our refund approval policy?"
            />
            <Button onClick={() => { void testRecall() }} disabled={busy || !query.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <SearchCheck />}
              Test
            </Button>
          </div>
        </div>

        {preview ? (
          <div className="space-y-3">
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">
                {preview.readyForAgents ? 'Ready for agents' : 'No trusted recall yet'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {preview.items.length} item{preview.items.length === 1 ? '' : 's'} retrieved for this scope.
              </p>
            </div>
            {preview.items.map((item) => (
              <div key={item.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{item.layer}</Badge>
                  {item.sourceLabel ? <Badge variant="secondary">{item.sourceLabel}</Badge> : null}
                  {typeof item.confidence === 'number' ? <Badge variant="outline">{Math.round(item.confidence * 100)}% confidence</Badge> : null}
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">{item.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.content}</p>
                {item.citations.length ? (
                  <p className="mt-2 text-xs text-muted-foreground">Citations: {item.citations.join(', ')}</p>
                ) : null}
              </div>
            ))}
            {preview.omitted.length ? (
              <p className="text-xs text-muted-foreground">
                Omitted: {preview.omitted.map((item) => `${item.count} ${item.layer} (${item.reason})`).join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
