import { NextResponse } from 'next/server'
import { getLucidProviderConfig } from '@/lib/ai/lucid-provider-config'
import { getWorkerHealthUrl } from '@/lib/worker/config'

export const dynamic = 'force-dynamic'

export const runtime = 'edge'
export const revalidate = 30 // ISR: cache for 30s

interface ServiceStatus {
  name: string
  status: 'operational' | 'degraded' | 'down'
  latency?: number // ms
  message?: string
}

interface StatusResponse {
  overall: 'operational' | 'degraded' | 'down'
  services: ServiceStatus[]
  timestamp: string
  cached: boolean
}

async function checkService(
  name: string,
  url: string,
  timeoutMs = 5000,
  headers: HeadersInit = {},
): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json', ...headers },
    })
    clearTimeout(timer)

    const latency = Date.now() - start

    if (res.ok) {
      return { name, status: 'operational', latency }
    }
    return {
      name,
      status: 'degraded',
      latency,
      message: `HTTP ${res.status}`,
    }
  } catch (err) {
    const latency = Date.now() - start
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Timeout'
        : 'Unreachable'
    return { name, status: 'down', latency, message }
  }
}

export async function GET() {
  const lucidProviderConfig = getLucidProviderConfig()
  const workerUrl = getWorkerHealthUrl()

  const lucidL2Url = lucidProviderConfig.baseUrl || process.env.NEXT_PUBLIC_LUCID_API_BASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  // Check services in parallel
  const checks = await Promise.allSettled([
    // Platform (self-check)
    Promise.resolve<ServiceStatus>({
      name: 'Platform',
      status: 'operational',
      latency: 0,
    }),

    // Worker (Railway)
    workerUrl
      ? checkService('Worker', workerUrl)
      : Promise.resolve<ServiceStatus>({
          name: 'Worker',
          status: 'operational',
          message: 'Not configured',
        }),

    // AI Gateway (Lucid-L2)
    lucidL2Url
      ? checkService('AI Gateway', `${lucidL2Url}/health`)
      : Promise.resolve<ServiceStatus>({
          name: 'AI Gateway',
          status: 'operational',
          message: 'Not configured',
        }),

    // Database (Supabase REST health)
    process.env.NEXT_PUBLIC_SUPABASE_URL
      ? checkService(
          'Database',
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/organizations?select=id&limit=1`,
          3000,
          supabaseAnonKey
            ? {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
              }
            : {},
        )
      : Promise.resolve<ServiceStatus>({
          name: 'Database',
          status: 'operational',
          message: 'Not configured',
        }),
  ])

  const services: ServiceStatus[] = checks.map((result) =>
    result.status === 'fulfilled'
      ? result.value
      : { name: 'Unknown', status: 'down' as const, message: 'Check failed' }
  )

  // Derive overall status
  const hasDown = services.some((s) => s.status === 'down')
  const hasDegraded = services.some((s) => s.status === 'degraded')
  const overall: StatusResponse['overall'] = hasDown
    ? 'down'
    : hasDegraded
      ? 'degraded'
      : 'operational'

  const response: StatusResponse = {
    overall,
    services,
    timestamp: new Date().toISOString(),
    cached: false,
  }

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    },
  })
}
