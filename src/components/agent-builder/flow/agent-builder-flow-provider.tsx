"use client"

import * as React from "react"
import type { ProjectBlueprint } from "@contracts/project-blueprint"
import type { TemplateCatalogEntry } from "@contracts/template"
import type { GenerationDraft } from "@/lib/ai/project-generation/schemas"
import type { CreateAgentFromBuilderDraftResult } from "@/lib/agent-builder/create-agent-from-builder-draft"
import {
  agentBuilderFlowReducer,
  createAgentBuilderFlowInitialState,
} from "@/components/agent-builder/flow/reducer"
import type {
  AgentBuilderFlowConfig,
  AgentBuilderFlowContextValue,
  BuilderConnectionRequirement,
  BuilderDeployPhase,
} from "@/components/agent-builder/flow/types"

const AgentBuilderFlowContext = React.createContext<AgentBuilderFlowContextValue | null>(null)

export function AgentBuilderFlowProvider({
  config,
  children,
}: {
  config: AgentBuilderFlowConfig
  children: React.ReactNode
}) {
  if (process.env.NODE_ENV !== "production") {
    validateConfig(config)
  }

  const configRef = React.useRef(config)
  configRef.current = config
  const [state, dispatch] = React.useReducer(
    agentBuilderFlowReducer,
    config,
    (initialConfig) => createAgentBuilderFlowInitialState(initialConfig),
  )

  const reset = React.useCallback(() => {
    dispatch({ type: "RESET", lifecycleId: `agent-builder-${crypto.randomUUID()}` })
  }, [])

  const actions = React.useMemo<AgentBuilderFlowContextValue["actions"]>(() => ({
    setPrompt(value) {
      dispatch({ type: "PROMPT_CHANGED", value })
    },
    submitPrompt(prompt) {
      const value = (prompt ?? state.prompt).trim()
      if (!value) return
      dispatch({ type: "PROMPT_SUBMITTED", prompt: value })
    },
    receiveDraft(draft: GenerationDraft, blueprint?: ProjectBlueprint | null) {
      dispatch({ type: "DRAFT_RECEIVED", draft, blueprint })
    },
    patchDraft(draft: GenerationDraft, blueprint?: ProjectBlueprint | null) {
      dispatch({ type: "DRAFT_PATCHED", draft, blueprint })
    },
    selectTemplate(template: TemplateCatalogEntry, draft?: GenerationDraft | null, blueprint?: ProjectBlueprint | null) {
      dispatch({ type: "TEMPLATE_SELECTED", templateSlug: template.slug, draft, blueprint })
    },
    selectCapability(slug) {
      dispatch({ type: "CAPABILITY_SELECTED", capabilitySlug: slug })
    },
    removeCapability(slug) {
      dispatch({ type: "CAPABILITY_REMOVED", capabilitySlug: slug })
    },
    setConnectionRequirements(requirements: BuilderConnectionRequirement[]) {
      dispatch({ type: "CONNECTION_REQUIREMENTS_RESOLVED", requirements })
    },
    openConnectApps() {
      dispatch({ type: "CONNECT_APPS_OPENED" })
    },
    markConnectionStarted(providerId) {
      dispatch({ type: "CONNECTION_STARTED", providerId })
    },
    markConnectionCompleted(providerId, bindingId) {
      dispatch({ type: "CONNECTION_COMPLETED", providerId, bindingId })
    },
    markConnectionFailed(providerId, message) {
      dispatch({ type: "CONNECTION_FAILED", providerId, message })
    },
    skipConnection(providerId) {
      dispatch({ type: "CONNECTION_SKIPPED", providerId })
    },
    markReady() {
      dispatch({ type: "READY" })
    },
    markDeployStarted(label) {
      dispatch({ type: "DEPLOY_STARTED", label })
    },
    markDeployProgress(phase: Exclude<BuilderDeployPhase, "idle" | "created" | "failed">, label?: string | null) {
      dispatch({ type: "DEPLOY_PROGRESS", phase, label })
    },
    markDeployCreated(result: CreateAgentFromBuilderDraftResult) {
      dispatch({ type: "DEPLOY_CREATED", result })
    },
    markDeployFailed(error: unknown) {
      dispatch({ type: "DEPLOY_FAILED", error: error instanceof Error ? error.message : "Builder deployment failed" })
    },
    close() {
      dispatch({ type: "CLOSED" })
      configRef.current.onClose?.()
    },
    reset,
  }), [reset, state.prompt])

  const unresolvedConnections = React.useMemo(
    () => state.connectionRequirements.filter((requirement) => {
      const status = state.connectionStateByProvider[requirement.providerId]?.status
      return status !== "connected" && status !== "using_existing" && status !== "skipped"
    }),
    [state.connectionRequirements, state.connectionStateByProvider],
  )

  const value = React.useMemo<AgentBuilderFlowContextValue>(() => ({
    ...state,
    config,
    actions,
    canClose: state.deployState.phase !== "deploying" && state.deployState.phase !== "connecting" && state.deployState.phase !== "creating",
    canDeploy: Boolean(state.blueprint || state.draft) && unresolvedConnections.length === 0,
    unresolvedConnections,
  }), [actions, config, state, unresolvedConnections])

  return (
    <AgentBuilderFlowContext.Provider value={value}>
      {children}
    </AgentBuilderFlowContext.Provider>
  )
}

export function useAgentBuilderFlow() {
  const context = React.useContext(AgentBuilderFlowContext)
  if (!context) {
    throw new Error("useAgentBuilderFlow must be used inside AgentBuilderFlowProvider")
  }
  return context
}

export function useOptionalAgentBuilderFlow() {
  return React.useContext(AgentBuilderFlowContext)
}

function validateConfig(config: AgentBuilderFlowConfig) {
  if (config.mode === "agent" && (!config.targetProjectId || !config.targetProjectSlug)) {
    throw new Error("Agent builder flow in agent mode requires targetProjectId and targetProjectSlug")
  }
}
