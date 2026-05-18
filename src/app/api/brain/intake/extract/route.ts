import { NextRequest, NextResponse } from 'next/server'

import { withCSRF } from '@/lib/auth/csrf'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import type { BrainIntakeFile } from '@/lib/brain-intake/schema'
import { ErrorService } from '@/lib/errors/error-service'

export const dynamic = 'force-dynamic'

const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_INLINE_TEXT_BYTES = 2 * 1024 * 1024

export const POST = withCSRF(async (req: NextRequest) => {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const userId = await getUserId()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const form = await req.formData()
    const orgId = String(form.get('orgId') ?? '')
    if (!orgId || !(await isUserOrgMember(userId, orgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const files = form.getAll('files').filter((value): value is File => value instanceof File).slice(0, 20)
    const extracted: BrainIntakeFile[] = []
    const warnings: string[] = []

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        warnings.push(`${file.name} exceeds the 25 MB intake limit.`)
        continue
      }
      const item = await extractFile(file)
      extracted.push(item)
      if (!item.text) warnings.push(`${file.name} needs asynchronous document ingestion before it is searchable.`)
    }

    return NextResponse.json({ files: extracted, warnings })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/brain/intake/extract', method: 'POST' },
      tags: { layer: 'api', route: 'brain-intake' },
    })
    return NextResponse.json({ error: 'Failed to extract Brain intake files' }, { status: 500 })
  }
})

async function extractFile(file: File): Promise<BrainIntakeFile> {
  const base = {
    name: file.name,
    type: file.type,
    size: file.size,
  }

  if (canReadAsText(file)) {
    return {
      ...base,
      text: (await file.text()).slice(0, 200_000),
    }
  }

  if (isDocx(file)) {
    const mammoth = await import('mammoth')
    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await mammoth.extractRawText({ buffer })
    return {
      ...base,
      text: result.value.trim().slice(0, 200_000) || undefined,
    }
  }

  return base
}

function canReadAsText(file: File): boolean {
  if (file.size > MAX_INLINE_TEXT_BYTES) return false
  return (
    file.type.startsWith('text/') ||
    file.type.includes('json') ||
    file.type.includes('yaml') ||
    file.type.includes('csv') ||
    file.name.endsWith('.md') ||
    file.name.endsWith('.txt') ||
    file.name.endsWith('.json') ||
    file.name.endsWith('.yaml') ||
    file.name.endsWith('.yml') ||
    file.name.endsWith('.csv')
  )
}

function isDocx(file: File): boolean {
  return (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.toLowerCase().endsWith('.docx')
  )
}
