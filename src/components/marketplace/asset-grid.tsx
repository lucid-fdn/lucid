'use client'

import { SearchFilters, UiAsset } from '@/lib/marketplace/types'
import { AssetCard } from '@/components/marketplace/AssetCard'
import { InfiniteList } from '@/components/ui/infinite-list'

interface AssetGridProps {
  initialAssets: UiAsset[]
  initialCursor?: string
  initialFilters: SearchFilters
}

export function AssetGrid({
  initialAssets,
  initialCursor: _initialCursor,
  initialFilters
}: AssetGridProps) {
  // Industry standard: Pass SSR data to InfiniteList as initialData
  // InfiniteList will use it as first page WITHOUT refetching
  return (
    <InfiniteList<UiAsset>
      endpoint="/api/v2/marketplace/search"
      filters={initialFilters}
      initialData={initialAssets}
      renderItem={(asset) => <AssetCard asset={asset} />}
      getItemKey={(asset) => asset.external_id}
      layout="grid"
      gridCols={4}
      limit={24}
      className="gap-6"
    />
  )
}
