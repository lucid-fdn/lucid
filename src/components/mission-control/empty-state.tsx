'use client'

import { EmptyState as PageEmptyState } from '@/components/page'
import React from 'react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  className,
}: EmptyStateProps) {
  return (
    <PageEmptyState
      icon={icon}
      title={title}
      description={description}
      className={className}
    />
  )
}
