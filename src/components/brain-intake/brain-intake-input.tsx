'use client'

import { useState } from 'react'
import { ArrowUp, FileText, FolderOpen, Loader2, Paperclip } from 'lucide-react'

import { BrainIntakeReviewSheet } from './brain-intake-review-sheet'
import { useBrainIntakeFlow } from './use-brain-intake-flow'
import { Button } from '@/components/ui/button'
import { FileUpload, FileUploadContent, FileUploadTrigger } from '@/ui/components/file-upload'
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/ui/components/prompt-input'
import { useToast } from '@/hooks/use-toast'
import type { BrainIntakeFile } from '@/lib/brain-intake/schema'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { cn } from '@/lib/utils'

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024

export function BrainIntakeInput({
  orgId,
  scopeId,
  onRecall,
  className,
}: {
  orgId: string
  scopeId: string
  onRecall?: (query: string) => void
  className?: string
}) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<BrainIntakeFile[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const flow = useBrainIntakeFlow({ orgId, scopeId, onRecall })

  const hasInput = text.trim().length > 0 || files.length > 0

  async function submit() {
    if (!hasInput || flow.isClassifying) return
    const items = await flow.classify(text, files)
    if (items.length === 0) {
      toast.info('Nothing to save', 'Paste context, a fact, a source URL, a document, or a recall question.')
      return
    }
    setReviewOpen(true)
  }

  async function commit() {
    const result = await flow.commit()
    if (!result) {
      toast.error('Brain update failed', flow.error ?? 'Try again in a moment.')
      return false
    }

    const created = result.results.filter((item) => item.status === 'created').length
    const needsUpload = result.results.filter((item) => item.status === 'needs_upload').length
    if (created > 0) toast.success('Brain updated', `${created} item${created === 1 ? '' : 's'} saved.`)
    if (needsUpload > 0) toast.warning('Some files need upload', 'Binary files need the document uploader to extract content.')
    setText('')
    setFiles([])
    return true
  }

  return (
    <FileUpload
      onFilesAdded={(nextFiles) => {
        void addFiles(nextFiles)
      }}
      multiple
      accept=".txt,.md,.json,.yaml,.yml,.csv,.pdf,.doc,.docx,text/*,application/json,application/pdf"
    >
      <section
        className={cn(
          'mx-auto w-full max-w-5xl overflow-hidden rounded-[36px] border border-border/55 bg-[radial-gradient(circle_at_top,hsl(var(--muted)/0.34),transparent_46%),hsl(var(--card)/0.58)] p-5 shadow-sm backdrop-blur sm:p-8 lg:p-10',
          className,
        )}
      >
        <FileUploadContent>
          <div className="flex w-[min(460px,calc(100vw-48px))] flex-col items-center gap-3 rounded-[28px] border border-border/60 bg-card p-5 shadow-2xl">
            <div className="flex w-full flex-col items-center rounded-2xl border border-dashed border-border/80 bg-background/70 px-6 py-7">
              <FolderOpen className="h-11 w-11 text-foreground" />
              <p className="mt-3 text-base font-medium text-foreground">Drop files into the Brain</p>
              <p className="mt-1 max-w-xs text-center text-sm leading-6 text-muted-foreground">
                Lucid will classify notes, docs, links, and decisions before saving them.
              </p>
            </div>
          </div>
        </FileUploadContent>

        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <div className="max-w-2xl space-y-2 px-1">
            <h3 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Drop anything into the Brain.
            </h3>
            <p className="text-sm leading-6 text-muted-foreground sm:text-base">
              Lucid absorbs notes, docs, links, decisions, and questions, then turns them into memory agents can trust.
            </p>
          </div>

          <div className="mt-8 flex min-h-[260px] w-full flex-col items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-background/35 px-4 py-8 text-center">
            <FolderOpen className="h-12 w-12 text-foreground" />
            <p className="mt-4 text-sm font-medium text-foreground sm:text-base">
              Drag files, notes, links, or decisions here.
            </p>
            <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span className="h-px w-10 bg-border" />
              or
              <span className="h-px w-10 bg-border" />
            </div>
            <FileUploadTrigger asChild>
              <Button type="button" variant="outline" className="rounded-full bg-background/80">
                Browse files
              </Button>
            </FileUploadTrigger>
          </div>

          <PromptInput
            value={text}
            onValueChange={setText}
            onSubmit={() => void submit()}
            isLoading={flow.isClassifying}
            maxHeight={220}
            className="mt-5 w-full rounded-none border-0 border-t border-border/65 bg-transparent p-0 pt-4 shadow-none focus-within:border-border/65 focus-within:shadow-none"
          >
            <PromptInputTextarea
              placeholder="Paste a rule, customer note, link, decision, or recall question..."
              className="min-h-[92px] resize-none border-none bg-transparent px-0 py-1 text-center text-base text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
            />

            {files.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2 pb-2 pt-1">
                {files.map((file) => (
                  <span
                    key={`${file.name}-${file.size}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    <FileText className="h-3 w-3" />
                    {file.name}
                  </span>
                ))}
              </div>
            ) : null}

            <PromptInputActions className="flex items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <PromptInputAction tooltip="Attach files">
                  <FileUploadTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                    >
                      <Paperclip className="h-4 w-4" />
                      Attach
                    </Button>
                  </FileUploadTrigger>
                </PromptInputAction>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Enter to review.
                </p>
              </div>
              <PromptInputAction tooltip="Review Brain update">
                <Button
                  type="button"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  disabled={!hasInput || flow.isClassifying}
                  onClick={() => void submit()}
                  aria-label="Review Brain update"
                >
                  {flow.isClassifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </Button>
              </PromptInputAction>
            </PromptInputActions>
          </PromptInput>
        </div>

        {flow.error ? (
          <p className="mt-3 px-1 text-xs text-destructive">{flow.error}</p>
        ) : null}

        <BrainIntakeReviewSheet
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          items={flow.items}
          summary={flow.summary}
          isCommitting={flow.isCommitting}
          onItemsChange={flow.setItems}
          onCommit={commit}
        />
      </section>
    </FileUpload>
  )

  async function addFiles(fileList: FileList | File[] | null) {
    if (!fileList || fileList.length === 0) return
    const rawFiles = Array.from(fileList)
    const localFiles = rawFiles.filter(canReadFileInBrowser)
    const serverFiles = rawFiles.filter((file) => !canReadFileInBrowser(file))
    const next = await Promise.all(localFiles.map(readFileForIntake))

    if (serverFiles.length > 0) {
      const extracted = await extractFilesOnServer(orgId, serverFiles)
      next.push(...extracted)
    }

    setFiles((current) => [...current, ...next].slice(0, 20))
  }
}

function canReadFileInBrowser(file: File): boolean {
  return file.size <= MAX_TEXT_FILE_BYTES && (
    file.type.startsWith('text/') ||
    file.type.includes('json') ||
    file.type.includes('yaml') ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.txt') ||
    file.name.endsWith('.json') ||
    file.name.endsWith('.yaml') ||
    file.name.endsWith('.yml') ||
    file.name.endsWith('.csv')
  )
}

async function readFileForIntake(file: File): Promise<BrainIntakeFile> {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    text: await file.text(),
  }
}

async function extractFilesOnServer(orgId: string, files: File[]): Promise<BrainIntakeFile[]> {
  const form = new FormData()
  form.set('orgId', orgId)
  for (const file of files) form.append('files', file)

  let csrfToken = getCSRFTokenFromCookie()
  if (!csrfToken) {
    await fetch('/api/auth/csrf', { credentials: 'include' }).catch(() => {})
    csrfToken = getCSRFTokenFromCookie()
  }

  const response = await fetch('/api/brain/intake/extract', {
    method: 'POST',
    credentials: 'include',
    headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
    body: form,
  })
  if (!response.ok) {
    return files.map((file) => ({ name: file.name, type: file.type, size: file.size }))
  }
  const payload = await response.json().catch(() => null) as { files?: BrainIntakeFile[] } | null
  return payload?.files ?? files.map((file) => ({ name: file.name, type: file.type, size: file.size }))
}
