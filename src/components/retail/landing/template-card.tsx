import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import type { RetailTemplate } from '@/lib/retail'

const CHANNEL_LABEL: Record<RetailTemplate['defaultChannel'], string> = {
  telegram: 'Telegram',
  web: 'Web widget',
  slack: 'Slack',
  discord: 'Discord',
}

const AUDIENCE_LABEL: Record<RetailTemplate['audience'], string> = {
  generic: 'Everyday',
  crypto: 'Crypto-native',
}

/**
 * Single template card on the landing gallery. Server component.
 *
 * Clicking the card deep-links into the future Phase 3 sign-up route
 * `/agents-preview/start/[slug]`. Phase 2 leaves that destination as a
 * placeholder — the route returns 404 until Phase 3 ships, which is
 * intentional: users on Phase 2 land via the hero CTA.
 */
export function RetailTemplateCard({ template }: { template: RetailTemplate }) {
  return (
    <Link
      href={`/agents-preview/start/${template.slug}`}
      className="group block focus-visible:outline-none"
    >
      <Card className="h-full transition-colors group-hover:border-foreground/30 group-focus-visible:border-foreground/60">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="text-xs font-normal">
              {AUDIENCE_LABEL[template.audience]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {CHANNEL_LABEL[template.defaultChannel]}
            </span>
          </div>
          <CardTitle className="mt-3 text-lg">{template.name}</CardTitle>
          <CardDescription className="text-sm">{template.tagline}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{template.description}</p>
        </CardContent>
      </Card>
    </Link>
  )
}
