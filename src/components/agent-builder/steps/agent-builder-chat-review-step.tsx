"use client"

import {
  AgentBuilderSessionPanel,
  type AgentBuilderSessionPanelProps,
} from "@/components/projects/project-builder-session-panel"

export type AgentBuilderChatReviewStepProps = AgentBuilderSessionPanelProps

export function AgentBuilderChatReviewStep(props: AgentBuilderChatReviewStepProps) {
  return <AgentBuilderSessionPanel {...props} />
}
