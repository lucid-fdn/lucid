'use client'

import { Loader2, Sparkles } from 'lucide-react'
import type { LucidPack } from '@contracts/lucid-pack'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCapabilityTemplateCategory } from '@/lib/templates/library'

interface CapabilityTemplateCardProps {
  pack: LucidPack
  onPreview: (pack: LucidPack) => void
  isLoading?: boolean
}

export function getCapabilityTemplateSearchText(pack: LucidPack): string {
  const composition = pack.manifest.composition
  return [
    pack.packKey,
    pack.name,
    pack.description,
    getCapabilityTemplateCategory(pack),
    String(pack.manifest.metadata?.default_risk ?? ''),
    ...(composition?.provides ?? []).map((capability) => `${capability.key} ${capability.name}`),
  ].join(' ')
}

export function CapabilityTemplateCard({
  pack,
  onPreview,
  isLoading = false,
}: CapabilityTemplateCardProps) {
  const composition = pack.manifest.composition
  const risk = String(pack.manifest.metadata?.default_risk ?? 'read_only')

  return (
    <Card className="flex min-h-64 flex-col overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-emerald-950/10 shadow-sm">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            <Sparkles data-icon="inline-start" />
            Template
          </Badge>
          <Badge variant="outline">Capability</Badge>
          <Badge variant={risk === 'high' ? 'destructive' : risk === 'medium' ? 'secondary' : 'outline'}>
            {risk.replace('_', ' ')}
          </Badge>
        </div>
        <div className="space-y-1">
          <CardTitle className="text-base">{pack.name}</CardTitle>
          <CardDescription className="line-clamp-3">{pack.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="flex flex-wrap gap-2">
          {(composition?.provides ?? []).slice(0, 4).map((capability) => (
            <Badge key={capability.key} variant="outline" className="max-w-full truncate">
              {capability.name}
            </Badge>
          ))}
          {(composition?.provides.length ?? 0) > 4 ? (
            <Badge variant="secondary">+{(composition?.provides.length ?? 0) - 4}</Badge>
          ) : null}
        </div>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPreview(pack)}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Preview
          </Button>
          <Button
            size="sm"
            onClick={() => onPreview(pack)}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Install
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
