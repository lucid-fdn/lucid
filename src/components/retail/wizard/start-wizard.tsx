'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { retailCsrfFetch } from '@/lib/retail/csrf-fetch'

import type { RetailTemplate } from '@/lib/retail'

const CHANNEL_LABEL: Record<RetailTemplate['defaultChannel'], string> = {
  telegram: 'Telegram',
  web: 'Web widget',
  slack: 'Slack',
  discord: 'Discord',
}

interface StartWizardProps {
  template: RetailTemplate
}

/**
 * 3-question retail wizard. Client component on purpose: keeps the
 * server route static and the form fully self-contained.
 */
export function StartWizard({ template }: StartWizardProps) {
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [goal, setGoal] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await retailCsrfFetch('/api/retail/agents', {
        method: 'POST',
        body: JSON.stringify({
          slug: template.slug,
          name,
          goal: goal || undefined,
        }),
      })

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || `Request failed (${res.status})`)
      }

      const json = (await res.json()) as { id: string }
      // Pass the template slug forward so the activation tutorial can show
      // the right sample prompts. Slug is untrusted in the next route —
      // the page resolves it via `getTemplateBySlug` and falls back to a
      // generic tutorial on miss.
      router.push(
        `/agents-preview/created/${json.id}?from=${encodeURIComponent(template.slug)}`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{template.name}</CardTitle>
        <CardDescription>{template.tagline}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="agent-name">Name your agent</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-goal">
              What would you like it to focus on?{' '}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="agent-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={template.samplePrompts[0]}
            />
          </div>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Default channel: <span className="text-foreground">{CHANNEL_LABEL[template.defaultChannel]}</span>
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create my agent'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
