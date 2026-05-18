'use client'

import React from 'react'
import { AssistantDetailClient } from './assistant-detail-client'
import type { AssistantDetailClientProps } from './assistant-detail-types'

export function AssistantDetailPageShell(props: AssistantDetailClientProps) {
  return <AssistantDetailClient {...props} />
}
