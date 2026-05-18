'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { retailCsrfFetch } from '@/lib/retail/csrf-fetch'
import {
  RETAIL_SOUL_MAX_LENGTH,
  RETAIL_SOUL_PRESETS,
} from '@/lib/retail/soul-presets'
import type { RetailSoulPreset } from '@/lib/retail/types'

interface PersonalityEditorProps {
  assistant: {
    id: string
    name: string
  }
  /** Current saved soul content (nullable — retail agents start blank). */
  initialContent: string | null
}

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'error'; message: string }

/**
 * Phase 6 — retail personality editor.
 *
 * Two interaction modes side by side:
 *   1. Preset cards — one tap applies a canned personality and saves.
 *   2. Free text — the user can edit the stored `soul_content` directly
 *      (starting from the current value OR from a preset they just picked).
 *
 * Save always POSTs to `/api/retail/agents/[id]/personality`. On success
 * we `router.refresh()` so the SSR initial content on next navigation is
 * the freshly saved value (no stale cache if the user navigates away and
 * back).
 *
 * Deliberately omits: model picker, temperature, tool toggles, plan
 * selector. Personality is the only lever retail users touch on this page.
 */
export function PersonalityEditor({
  assistant,
  initialContent,
}: PersonalityEditorProps) {
  const router = useRouter()
  const [content, setContent] = useState(initialContent ?? '')
  // Tracks the last value we committed to the server — lets the free-text
  // Save button disable itself when the textarea hasn't changed since the
  // last successful save (initial load, preset apply, or free-text save).
  const [lastSavedContent, setLastSavedContent] = useState(initialContent ?? '')
  const [activePresetId, setActivePresetId] =
    useState<RetailSoulPreset | null>(null)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })

  async function applyPreset(preset: RetailSoulPreset) {
    setActivePresetId(preset)
    setSaveState({ status: 'saving' })
    try {
      const res = await retailCsrfFetch(
        `/api/retail/agents/${assistant.id}/personality`,
        {
          method: 'POST',
          body: JSON.stringify({ presetId: preset }),
        },
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(body?.error || 'Failed to apply personality')
      }
      const data = (await res.json()) as { soulContent: string }
      setContent(data.soulContent)
      setLastSavedContent(data.soulContent)
      setSaveState({ status: 'idle' })
      router.refresh()
    } catch (err) {
      setSaveState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  async function saveFreeText() {
    setSaveState({ status: 'saving' })
    try {
      const res = await retailCsrfFetch(
        `/api/retail/agents/${assistant.id}/personality`,
        {
          method: 'POST',
          body: JSON.stringify({ content }),
        },
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(body?.error || 'Failed to save')
      }
      setActivePresetId(null)
      setLastSavedContent(content)
      setSaveState({ status: 'idle' })
      router.refresh()
    } catch (err) {
      setSaveState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const saving = saveState.status === 'saving'
  const remaining = RETAIL_SOUL_MAX_LENGTH - content.length
  // Disable Save when the textarea matches the last committed value. Prevents
  // redundant POSTs for no-op clicks after a preset apply or a prior save.
  const contentDirty = content !== lastSavedContent

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {assistant.name}&apos;s personality
        </h1>
        <p className="text-base text-muted-foreground">
          Pick a vibe, or write your own. This changes how your agent
          responds — the tools and skills it has access to stay the same.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Presets</CardTitle>
          <CardDescription>
            Tap to apply instantly. You can tweak the text afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {RETAIL_SOUL_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={saving}
                onClick={() => applyPreset(preset.id)}
                aria-pressed={activePresetId === preset.id}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-md border bg-background px-4 py-3 text-left transition-colors',
                  'hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-60',
                  activePresetId === preset.id && 'border-foreground',
                )}
              >
                <span className="text-sm font-medium text-foreground">
                  {preset.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {preset.tagline}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Custom personality</CardTitle>
          <CardDescription>
            Write it yourself. Leave blank to clear the personality entirely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="You are a ..."
            rows={8}
            maxLength={RETAIL_SOUL_MAX_LENGTH}
            disabled={saving}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{remaining.toLocaleString()} characters left</span>
            <Button
              type="button"
              size="sm"
              disabled={saving || !contentDirty}
              onClick={saveFreeText}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {saveState.status === 'error' ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {saveState.message}
        </p>
      ) : null}
    </div>
  )
}
