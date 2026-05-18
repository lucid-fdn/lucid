import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AlertTriangle, BadgeCheck, MessageSquareText, ShieldCheck } from 'lucide-react'
import { getUserId } from '@/lib/auth/server-utils'
import { AppServiceError } from '@/lib/app-service/errors'
import { assertAppServiceSurfacesEnabled } from '@/lib/app-service/feature-gates'
import { getPublicAppShellData } from '@/lib/app-service/public-shell'
import { getPrimaryShellPage } from '@/lib/app-service/public-shell-core'
import { PublicAppInteractions } from './public-app-interactions'

export const dynamic = 'force-dynamic'

function assertPublicAppsEnabled() {
  assertAppServiceSurfacesEnabled(['publicApps'])
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  try {
    assertPublicAppsEnabled()
    const { slug } = await params
    const data = await getPublicAppShellData(slug)
    return {
      title: data.manifest.name,
      description: data.manifest.description ?? `Public Lucid app ${data.manifest.name}`,
    }
  } catch {
    return {
      title: 'Generated App',
    }
  }
}

function blockText(props: Record<string, unknown>, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = props[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return fallback
}

export default async function PublicGeneratedAppPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  try {
    assertPublicAppsEnabled()
  } catch {
    notFound()
  }

  const { slug } = await params
  const userId = await getUserId()

  try {
    const data = await getPublicAppShellData(slug, userId)
    const page = getPrimaryShellPage(data.manifest)
    const hero = page.blocks.find((block) => block.enabled && block.type === 'hero')
    const summary = page.blocks.find((block) => block.enabled && block.type === 'service_summary')
    const proof = page.blocks.find((block) => block.enabled && block.type === 'proof_metrics')
    const headline = hero ? blockText(hero.props, ['headline', 'title'], data.manifest.name) : data.manifest.name
    const promise = summary
      ? blockText(summary.props, ['promise', 'summary', 'description'], data.manifest.description ?? data.app.name)
      : data.manifest.description ?? data.app.name

    return (
      <main className="min-h-screen bg-background text-foreground">
        <section className="mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-4 py-6 md:grid-cols-[0.9fr_1.1fr] md:px-8 md:py-10">
          <div className="flex flex-col justify-between gap-8">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Lucid App
                </span>
                {data.isPreview ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Preview
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Live
                  </span>
                )}
              </div>

              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-foreground md:text-6xl">
                  {headline}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                  {promise}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Status</p>
                  <p className="mt-1 text-sm font-semibold capitalize">{data.config.status.replace(/_/g, ' ')}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Capabilities</p>
                  <p className="mt-1 text-sm font-semibold">{data.manifest.capabilities.length}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Updated</p>
                  <p className="mt-1 text-sm font-semibold">{new Date(data.app.updated_at).toLocaleDateString()}</p>
                </div>
              </div>

              {proof ? (
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                    Proof
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Array.isArray(proof.props.metrics) ? proof.props.metrics.slice(0, 6).map((metric) => (
                      typeof metric === 'string' ? (
                        <span key={metric} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                          {metric.replace(/[_-]/g, ' ')}
                        </span>
                      ) : null
                    )) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="text-xs text-muted-foreground">
              {data.manifest.marketplace.creator_attribution ?? 'Powered by Lucid'}
            </div>
          </div>

          <PublicAppInteractions
            config={data.config}
            manifest={data.manifest}
            isPreview={data.isPreview}
          />
        </section>
      </main>
    )
  } catch (error) {
    if (error instanceof AppServiceError && error.status === 404) {
      notFound()
    }
    throw error
  }
}
