/**
 * Feature State Panel
 *
 * Reusable component that renders the correct UI for any feature
 * based on its FeatureState: hidden | discoverable | setup-required | active | attention.
 *
 * "No dead-ends policy": always shows a next-step CTA.
 */

'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, Lock, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { FeatureState } from '@/lib/workspace/capabilities'

interface NextAction {
  action: string
  label: string
  href?: string
}

interface FeatureStatePanelProps {
  state: FeatureState
  /** Rendered when state === 'active' */
  children?: ReactNode
  /** Feature display name */
  featureName: string
  /** One-line description for discoverable / setup states */
  description?: string
  /** CTA when user cannot access feature */
  nextAction?: NextAction | null
  /** Icon shown in non-active states */
  icon?: ReactNode
  /** Extra class names */
  className?: string
}

export function FeatureStatePanel({
  state,
  children,
  featureName,
  description,
  nextAction,
  icon,
  className = '',
}: FeatureStatePanelProps) {
  if (state === 'hidden') return null

  if (state === 'active') {
    return <>{children}</>
  }

  // ---- discoverable / setup-required / attention ----
  const stateConfig: Record<string, { title: string; desc: string; variant: 'default' | 'outline'; iconEl: ReactNode }> = {
    discoverable: {
      title: `Unlock ${featureName}`,
      desc: description || `Upgrade your plan to access ${featureName}.`,
      variant: 'default',
      iconEl: icon || <Sparkles className="h-8 w-8 text-muted-foreground" />,
    },
    'setup-required': {
      title: `Set up ${featureName}`,
      desc: description || `${featureName} is available on your plan. Complete the setup to get started.`,
      variant: 'default',
      iconEl: icon || <Lock className="h-8 w-8 text-muted-foreground" />,
    },
    attention: {
      title: `${featureName} needs attention`,
      desc: description || `There is an issue with ${featureName} that requires action.`,
      variant: 'outline',
      iconEl: icon || <AlertTriangle className="h-8 w-8 text-yellow-500" />,
    },
  }

  const cfg = stateConfig[state] || stateConfig.discoverable

  return (
    <Card className={`mx-auto max-w-lg text-center ${className}`}>
      <CardHeader className="items-center gap-3 pb-2">
        {cfg.iconEl}
        <CardTitle className="text-lg">{cfg.title}</CardTitle>
        <CardDescription className="max-w-sm">{cfg.desc}</CardDescription>
      </CardHeader>
      <CardContent>
        {nextAction && (
          nextAction.href ? (
            <Button asChild variant={cfg.variant}>
              <Link href={nextAction.href}>
                {nextAction.label}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button variant={cfg.variant}>
              {nextAction.label}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )
        )}
      </CardContent>
    </Card>
  )
}