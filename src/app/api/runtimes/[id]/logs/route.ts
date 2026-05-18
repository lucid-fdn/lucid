import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { isUserOrgMember } from '@/lib/db'
import { getRuntimeById } from '@/lib/db/mission-control'
import { getL2BaseUrl } from '@/lib/deployment-mode'
import { ErrorService } from '@/lib/errors/error-service'
import { getL2AdminAuthHeaders } from '@/lib/lucid-l2/admin-auth'

export const dynamic = 'force-dynamic'

function normalizeLogLines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeLogLines(entry))
  }
  if (typeof value === 'string') {
    return value.split(/\r?\n/).filter((line) => line.trim().length > 0)
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const message = record.message ?? record.msg ?? record.text ?? record.line
    if (typeof message === 'string') {
      return normalizeLogLines(message)
    }
    return [JSON.stringify(value)]
  }
  return []
}

function redactRuntimeLogLine(line: string): string {
  return line
    .replace(/([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|DSN)[A-Z0-9_]*\s*[:=]\s*)(['"]?)[^'",\s}]+\2/gi, '$1[redacted]')
    .replace(/(executablePath\s*[:=]\s*)(['"]?)[^'",\s}]+\2/gi, '$1[managed runtime]')
    .replace(/(HERMES_HOME|OPENCLAW_HOME|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL|RAILWAY_[A-Z0-9_]+)\s*[:=]\s*[^'",\s}]+/gi, '$1=[redacted]')
    .replace(/\b(?:\/Users|\/home|\/var|\/tmp|\/usr\/local\/bin|\/opt)\/[^\s'",}]+/g, '[managed path]')
    .replace(/https:\/\/[a-z0-9-]+\.supabase\.co/gi, '[managed datastore]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|[A-Za-z0-9_-]{32,})\b/g, '[redacted]')
}

function toPublicRuntimeLogs(value: unknown, managedByLucid: boolean): string[] {
  const lines = normalizeLogLines(value)
  if (!managedByLucid) {
    return lines.map(redactRuntimeLogLine)
  }

  return lines
    .map(redactRuntimeLogLine)
    .filter((line) => {
      const lower = line.toLowerCase()
      return !(
        lower.includes('available_skills') ||
        lower.includes('system prompt') ||
        lower.includes('prompt:') ||
        lower.includes('argv') ||
        lower.includes('stderrpreview') ||
        lower.includes('stdoutpreview')
      )
    })
    .slice(-100)
}

function buildManagedRuntimeLogLines(runtime: NonNullable<Awaited<ReturnType<typeof getRuntimeById>>>): string[] {
  const lines = [
    `Lucid Runtime · status ${runtime.status}`,
    `Lucid Runtime · engine ${runtime.engine}`,
    `Lucid Runtime · protocol ${runtime.runtimeProtocol}`,
    `Lucid Runtime · attached agents ${runtime.agentCount}`,
  ]
  if (runtime.lastSeenAt) {
    lines.push(`Lucid Runtime · last heartbeat ${runtime.lastSeenAt}`)
  }
  if (runtime.lastL2CheckedAt) {
    lines.push(`Lucid Runtime · infrastructure check ${runtime.lastL2CheckedAt}`)
  }
  if (runtime.lastL2Error) {
    lines.push('Lucid Runtime · provider diagnostics are being reviewed by Lucid operators')
  }
  return lines
}

// GET /api/runtimes/[id]/logs?org_id=xxx&lines=100
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 })
    }

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const runtime = await getRuntimeById(id, orgId)
    if (!runtime) {
      return NextResponse.json({ error: 'Runtime not found' }, { status: 404 })
    }

    const isLucidManagedRuntime = runtime.managedByLucid || runtime.runtimeTier === 'dedicated'
    if (isLucidManagedRuntime) {
      return NextResponse.json({
        logs: buildManagedRuntimeLogLines(runtime),
        message: 'Lucid-managed runtime logs are sanitized. Raw provider diagnostics are retained internally.',
      })
    }

    // L2 Gateway proxy — prefer passport-based route, fall back to deployment ID
    const l2Base = getL2BaseUrl()
    const l2Key = runtime.l2PassportId || runtime.l2DeploymentId
    if (!l2Base || !l2Key) {
      return NextResponse.json({
        logs: [],
        message: !l2Base
          ? 'L2 Gateway not configured'
          : 'Runtime was provisioned manually — container logs unavailable',
      })
    }

    // Passport-based: GET /v1/agents/:passportId/logs
    // Legacy fallback: GET /v1/agents/:deploymentId/logs
    const lines = request.nextUrl.searchParams.get('lines') || '100'
    try {
      const l2Response = await fetch(
        `${l2Base}/v1/agents/${encodeURIComponent(l2Key)}/logs?lines=${lines}`,
        {
          headers: {
            ...getL2AdminAuthHeaders(),
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
        }
      )

      if (!l2Response.ok) {
        return NextResponse.json({
          logs: [],
          message: `L2 returned ${l2Response.status}`,
        })
      }

      const data = await l2Response.json()
      return NextResponse.json({
        logs: toPublicRuntimeLogs(data.logs ?? [], isLucidManagedRuntime),
      })
    } catch (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { endpoint: '/api/runtimes/[id]/logs GET', runtimeId: id, fallback: 'empty_logs' },
        tags: { layer: 'api', route: 'runtimes' },
      })
      return NextResponse.json({
        logs: [],
        message: 'Runtime logs temporarily unavailable',
      })
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { endpoint: '/api/runtimes/[id]/logs GET' },
      tags: { layer: 'api', route: 'runtimes' },
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
