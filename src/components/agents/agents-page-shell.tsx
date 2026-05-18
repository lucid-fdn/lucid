import type { ComponentProps } from 'react'

import { AgentsListClient } from './agents-list-client'

export type AgentsPageShellProps = ComponentProps<typeof AgentsListClient>

export function AgentsPageShell(props: AgentsPageShellProps) {
  return <AgentsListClient {...props} />
}

