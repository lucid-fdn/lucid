'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

import { retailCsrfFetch } from '@/lib/retail/csrf-fetch'

/** Matches the server schema in `/api/orgs/[id]/board-memory`. */
const MAX_CONTENT_LENGTH = 10_000

export interface KnowledgeEntry {
  id: string
  content: string
  createdAt: string
}

interface KnowledgeEditorProps {
  /**
   * The user's retail personal org id. Resolved server-side from the
   * retail org metadata flag — we pass it as a prop instead of fetching
   * in the client to avoid a pointless extra round-trip on page load.
   */
  orgId: string
  initialEntries: KnowledgeEntry[]
}

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'error'; message: string }

/**
 * Phase 6 — retail knowledge editor.
 *
 * Thin UI over the existing `/api/orgs/[id]/board-memory` API. Retail
 * users own their personal org (auto-provisioned by `ensureRetailOrg`),
 * so the shared endpoint's `admin|owner` role gate passes transparently.
 *
 * Scope deliberately minimal:
 *   - No category selector — everything saves as the default `insight`.
 *     Retail users shouldn't have to think about taxonomy; the worker's
 *     prompt injection doesn't filter on category today anyway.
 *   - No importance slider — server default (0.7) is fine.
 *   - No edit-in-place — delete + re-add if you need to change something.
 *     Keeps the data model append-only and the UI simple.
 *
 * When the user curates a fact here, it lands in `org_board_memory` and
 * gets injected into every agent in their retail org via the
 * `## Organization Knowledge` system-prompt block.
 */
export function KnowledgeEditor({
  orgId,
  initialEntries,
}: KnowledgeEditorProps) {
  const router = useRouter()
  const [entries, setEntries] = useState(initialEntries)
  const [draft, setDraft] = useState('')
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })

  async function addEntry() {
    const trimmed = draft.trim()
    if (!trimmed) return

    // Optimistic insert with a temp id so the user sees the new entry
    // immediately. We swap in the server-assigned id once the POST
    // resolves, or roll the entry back on failure. Matches the
    // optimistic-then-sync pattern used elsewhere in the codebase
    // (e.g. unified-skill-manager, channels-section).
    const tempId = `temp-${crypto.randomUUID()}`
    const optimisticEntry: KnowledgeEntry = {
      id: tempId,
      content: trimmed,
      createdAt: new Date().toISOString(),
    }
    setEntries((prev) => [optimisticEntry, ...prev])
    setDraft('')
    setSaveState({ status: 'saving' })

    try {
      const res = await retailCsrfFetch(`/api/orgs/${orgId}/board-memory`, {
        method: 'POST',
        body: JSON.stringify({ content: trimmed }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        // 409 = duplicate content hash. The optimistic entry is a lie
        // (the real one is already in `entries` from SSR), so drop it.
        if (res.status === 409) {
          setEntries((prev) => prev.filter((e) => e.id !== tempId))
          setSaveState({ status: 'idle' })
          return
        }
        throw new Error(body?.error || 'Failed to save')
      }
      const data = (await res.json()) as {
        memory: { id: string; content: string; created_at: string }
      }
      // Swap temp id for the real one + canonical timestamps from server.
      setEntries((prev) =>
        prev.map((e) =>
          e.id === tempId
            ? {
                id: data.memory.id,
                content: data.memory.content,
                createdAt: data.memory.created_at,
              }
            : e,
        ),
      )
      setSaveState({ status: 'idle' })
      // Refresh so SSR reloads on next nav with the new entry.
      router.refresh()
    } catch (err) {
      // Rollback the optimistic insert and restore the draft so the
      // user doesn't lose what they typed.
      setEntries((prev) => prev.filter((e) => e.id !== tempId))
      setDraft(trimmed)
      setSaveState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  async function deleteEntry(memoryId: string) {
    // Optimistic remove. Snapshot first so we can restore on error.
    const previous = entries
    setEntries((prev) => prev.filter((e) => e.id !== memoryId))
    setSaveState({ status: 'saving' })

    try {
      const res = await retailCsrfFetch(`/api/orgs/${orgId}/board-memory`, {
        method: 'DELETE',
        body: JSON.stringify({ memoryId }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(body?.error || 'Failed to delete')
      }
      setSaveState({ status: 'idle' })
      router.refresh()
    } catch (err) {
      setEntries(previous)
      setSaveState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const saving = saveState.status === 'saving'
  const remaining = MAX_CONTENT_LENGTH - draft.length

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Knowledge
        </h1>
        <p className="text-base text-muted-foreground">
          Facts and rules every one of your agents should know. Think of
          it as a shared notebook — each entry gets injected into your
          agents&apos; context on every conversation.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add a fact</CardTitle>
          <CardDescription>
            One thought per entry. Short and specific works best.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. We ship orders on Mondays and Thursdays only."
            rows={4}
            maxLength={MAX_CONTENT_LENGTH}
            disabled={saving}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{remaining.toLocaleString()} characters left</span>
            <Button
              type="button"
              size="sm"
              disabled={saving || !draft.trim()}
              onClick={addEntry}
            >
              {saving ? 'Saving…' : 'Add to knowledge'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Saved facts ({entries.length})
          </CardTitle>
          <CardDescription>
            All of these are visible to every agent in your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Add your first fact above.
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <p className="flex-1 whitespace-pre-wrap text-foreground">
                    {entry.content}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => deleteEntry(entry.id)}
                    aria-label={`Delete knowledge entry`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
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
