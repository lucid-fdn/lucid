"use client"

import {
  AgentBuilderConnectAppsDialog,
  type AgentBuilderConnectAppsDialogProps,
} from "@/components/projects/project-builder-connect-apps-dialog"

export type AgentBuilderConnectAppsStepProps = AgentBuilderConnectAppsDialogProps

export function AgentBuilderConnectAppsStep(props: AgentBuilderConnectAppsStepProps) {
  return <AgentBuilderConnectAppsDialog {...props} />
}
