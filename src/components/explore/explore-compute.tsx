import { Suspense } from 'react'
import { SkeletonGrid } from '@/components/marketplace/SkeletonGrid'
import { CategoryNav } from './category-nav'
import { AssetGrid } from '@/components/marketplace/asset-grid'
import { getAssets } from '@/lib/marketplace/marketplace-service'
import type { SearchFilters, UiAsset } from '@/lib/marketplace/types'
import type { ExplorePageProps } from './types'
import {
  Server,
  Cpu,
  Globe,
  Shield,
  Zap,
} from 'lucide-react'

const GPU_CATEGORIES = [
  {
    name: 'H100 SXM',
    description: 'Flagship AI training & inference',
    specs: '80GB HBM3 · 989 TFLOPS',
    icon: Cpu,
    priceRange: '$2.49+/hr',
    badge: 'Fastest',
    badgeColor: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950',
  },
  {
    name: 'A100',
    description: 'Professional AI workloads',
    specs: '80GB HBM2e · 312 TFLOPS',
    icon: Cpu,
    priceRange: '$1.74+/hr',
    badge: 'Popular',
    badgeColor: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950',
  },
  {
    name: 'L40S',
    description: 'Inference optimized',
    specs: '48GB GDDR6 · 362 TFLOPS',
    icon: Cpu,
    priceRange: '$0.89+/hr',
    badge: 'Best Value',
    badgeColor: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950',
  },
  {
    name: 'RTX 4090',
    description: 'High-performance inference',
    specs: '24GB GDDR6X · 82.6 TFLOPS',
    icon: Cpu,
    priceRange: '$0.44+/hr',
    badge: 'Budget',
    badgeColor: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950',
  },
]

const REGIONS = [
  { name: 'Europe', flag: '🇪🇺', count: 3, compliance: 'GDPR' },
  { name: 'US East', flag: '🇺🇸', count: 5, compliance: 'SOC 2' },
  { name: 'US West', flag: '🇺🇸', count: 4, compliance: 'SOC 2' },
  { name: 'Asia Pacific', flag: '🌏', count: 2, compliance: '' },
]

const FEATURES = [
  {
    icon: Shield,
    title: 'Confidential Compute',
    description: 'Hardware-attested secure enclaves for sensitive workloads',
  },
  {
    icon: Globe,
    title: 'Multi-Region',
    description: 'Deploy close to your users with EU, US, and APAC availability',
  },
  {
    icon: Zap,
    title: 'Instant Provisioning',
    description: 'GPUs ready in seconds, not minutes. Scale up and down on demand',
  },
  {
    icon: Server,
    title: 'DePIN Network',
    description: 'Decentralized GPU mesh for cost-effective distributed compute',
  },
]

/**
 * Shared Compute page component
 * Used by both marketing and workspace routes
 */
export async function ExploreCompute({
  isAuthenticated: _isAuthenticated,
  basePath,
  params,
}: ExplorePageProps) {
  const hasSearch = Boolean(params.q || params.gpu || params.region)

  if (hasSearch) {
    const filters: SearchFilters = {
      q: typeof params.q === 'string' ? params.q : undefined,
      kind: 'COMPUTE',
      limit: 24,
    }

    const { assets: rawAssets } = await getAssets(filters)
    const assets = rawAssets as unknown as UiAsset[]

    return (
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">GPU Compute</h1>
            <p className="text-sm text-muted-foreground">
              Deploy GPUs on-demand — RunPod, DePIN & more providers
            </p>
          </div>
          <CategoryNav basePath={basePath} />
        </div>

        <div>
          {assets.length > 0 ? (
            <AssetGrid
              initialAssets={assets}
              initialCursor={undefined}
              initialFilters={filters}
            />
          ) : (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-lg">
                No compute resources found
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const { assets: computeAssets } = await getAssets({
    kind: 'COMPUTE',
    limit: 12,
  })

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GPU Compute</h1>
          <p className="text-sm text-muted-foreground">
            Deploy GPUs on-demand — RunPod, DePIN & more providers
          </p>
        </div>
        <CategoryNav basePath={basePath} />
      </div>

      {/* GPU Type Cards */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Available GPUs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {GPU_CATEGORIES.map((gpu) => {
            const Icon = gpu.icon
            return (
              <div
                key={gpu.name}
                className="group relative rounded-xl border bg-card p-5 hover:shadow-md transition-all duration-200 hover:border-foreground/20 cursor-pointer"
              >
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${gpu.badgeColor} mb-3`}>
                  {gpu.badge}
                </span>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="size-5 text-muted-foreground" />
                    <h3 className="font-semibold">{gpu.name}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{gpu.description}</p>
                  <p className="text-xs text-muted-foreground/70 font-mono">{gpu.specs}</p>
                </div>
                <div className="mt-4 pt-3 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{gpu.priceRange}</span>
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                      Deploy →
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Regions */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Regions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {REGIONS.map((region) => (
            <div
              key={region.name}
              className="flex items-center gap-3 rounded-lg border bg-card p-4 hover:border-foreground/20 transition-colors cursor-pointer"
            >
              <span className="text-2xl">{region.flag}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{region.name}</span>
                  <span className="text-xs text-muted-foreground">({region.count})</span>
                </div>
                {region.compliance && (
                  <span className="text-xs text-muted-foreground">{region.compliance}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Available Compute Resources */}
      {computeAssets.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Available Resources</h2>
          <Suspense fallback={<SkeletonGrid count={4} />}>
            <AssetGrid
              initialAssets={computeAssets as unknown as UiAsset[]}
              initialCursor={undefined}
              initialFilters={{ kind: 'COMPUTE', limit: 12 }}
            />
          </Suspense>
        </section>
      )}

      {/* Platform Features */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Platform Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="flex gap-4 rounded-lg border bg-card p-4"
              >
                <div className="flex-shrink-0 size-10 rounded-lg bg-muted flex items-center justify-center">
                  <Icon className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-sm">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Coming Soon */}
      <section className="rounded-xl border border-dashed bg-muted/30 p-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          More compute providers coming soon
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          RunPod · Render Network · Akash · io.net · and more
        </p>
      </section>
    </div>
  )
}