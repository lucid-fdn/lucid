"use client"

import * as React from "react"
import {
  AgentBuilderFlowProvider,
} from "@/components/agent-builder/flow/agent-builder-flow-provider"
import type { AgentBuilderFlowConfig } from "@/components/agent-builder/flow/types"

export function AgentBuilderFlow({
  config,
  children,
}: {
  config: AgentBuilderFlowConfig
  children: React.ReactNode
}) {
  return (
    <AgentBuilderFlowProvider config={config}>
      {children}
    </AgentBuilderFlowProvider>
  )
}
