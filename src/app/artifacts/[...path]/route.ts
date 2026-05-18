import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getServerSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ARTIFACT_BUCKET = process.env.BROWSER_QA_ARTIFACT_BUCKET?.trim() || 'agent-ops-browser-qa'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  const params = await context.params
  const pathSegments = params.path ?? []
  const artifactKey = normalizeArtifactKey(pathSegments)
  if (!artifactKey) {
    return NextResponse.json({ error: 'Invalid artifact path' }, { status: 400 })
  }

  const orgId = pathSegments[0]
  const authorized = await canReadArtifact(request, orgId)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .storage
    .from(ARTIFACT_BUCKET)
    .download(artifactKey)

  if (error || !data) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
  }

  const bytes = Buffer.from(await data.arrayBuffer())
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentTypeForArtifactKey(artifactKey),
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, max-age=3600, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

async function canReadArtifact(request: NextRequest, orgId: string | undefined): Promise<boolean> {
  const workerSecret = process.env.WORKER_TRIGGER_SECRET?.trim()
  const authHeader = request.headers.get('authorization')
  if (workerSecret && authHeader === `Bearer ${workerSecret}`) return true

  if (!isUuid(orgId)) return false

  const session = await getServerSession()
  if (!session.userId) return false

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', session.userId)
    .limit(1)
    .maybeSingle()

  return !error && Boolean(data)
}

function normalizeArtifactKey(pathSegments: string[]): string | null {
  if (pathSegments.length < 2) return null
  const safeSegments = pathSegments.map((segment) => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  })
  if (safeSegments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('/'))) {
    return null
  }
  return safeSegments.join('/')
}

function contentTypeForArtifactKey(key: string): string {
  if (key.endsWith('.png')) return 'image/png'
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg'
  if (key.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

function isUuid(value: string | undefined): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
