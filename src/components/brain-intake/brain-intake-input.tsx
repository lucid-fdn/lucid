'use client'

import { useState } from 'react'
import { ArrowUp, FileText, Loader2, Paperclip, Sparkles, Upload } from 'lucide-react'

import { BrainIntakeReviewSheet } from './brain-intake-review-sheet'
import { useBrainIntakeFlow } from './use-brain-intake-flow'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FileUpload, FileUploadContent, FileUploadTrigger } from '@/ui/components/file-upload'
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
          'rounded-[32px] border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur',
          className,
        )}
      >
        <FileUploadContent>
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-background/95 p-8 shadow-xl">
            <Upload className="h-10 w-10 text-primary/60" />
            <p className="text-base font-medium text-foreground">Drop Brain files here</p>
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Text, markdown, JSON, YAML, PDFs, and docs will be routed through the Brain intake flow.
            </p>
          </div>
        </FileUploadContent>

        <div className="mb-3 flex items-start justify-between gap-3 px-1">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Add to Brain</h3>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Paste anything. Lucid classifies it into context, facts, documents, sources, or a recall test before saving.
            </p>
          </div>
        </div>

        <div className="rounded-[28px] border border-border/70 bg-background/75 p-2 shadow-xs transition-colors focus-within:border-primary/35">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
            }}
            placeholder="Paste a company rule, customer note, document, source URL, or question to test recall..."
            className="min-h-[104px] resize-none border-none bg-transparent px-3 py-3 text-base shadow-none focus-visible:ring-0"
          />

          {files.length > 0 ? (
            <div className="flex flex-wrap gap-2 px-3 pb-2">
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

          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
            <div className="flex items-center gap-2">
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
              <p className="hidden text-xs text-muted-foreground sm:block">
                Drop files or press Cmd+Enter.
              </p>
            </div>
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
          </div>
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
