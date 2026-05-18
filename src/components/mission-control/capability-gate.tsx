'use client'

/**
 * Mission Control — Capability Gate
 *
 * Renders children only if the specified capability is available.
 * Declarative, testable, no scattered `if` checks.
 */

import type { ReactNode } from 'react'
import { useCapabilities } from '@/hooks/use-capabilities'
import type { Capability } from '@/lib/mission-control/capabilities'

interface CapabilityGateProps {
  capability: Capability
  children: ReactNode
  /** Optional fallback when capability is absent */
  fallback?: ReactNode
}

export function CapabilityGate({ capability, children, fallback = null }: CapabilityGateProps) {
  const { hasCapability } = useCapabilities()

  if (!hasCapability(capability)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
