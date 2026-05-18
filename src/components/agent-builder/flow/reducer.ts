"use client"

import type {
  AgentBuilderFlowConfig,
  AgentBuilderFlowEvent,
  AgentBuilderFlowState,
  BuilderConnectionRequirement,
} from "@/components/agent-builder/flow/types"

export function createAgentBuilderFlowInitialState(
  config: AgentBuilderFlowConfig,
  lifecycleId = `agent-builder-${crypto.randomUUID()}`,
): AgentBuilderFlowState {
  return {
    step: config.initialPrompt?.trim() ? "chat_review" : "start",
    mode: config.mode,
    surface: config.surface ?? "page",
    lifecycleId,
    prompt: config.initialPrompt ?? "",
    submittedPrompt: config.initialPrompt?.trim() ? config.initialPrompt.trim() : null,
    draft: config.initialDraft ?? null,
    blueprint: null,
    selectedTemplateSlug: config.initialTemplateSlug ?? null,
    selectedCapabilitySlugs: [],
    skippedStepIds: [],
    connectionRequirements: [],
    connectionStateByProvider: {},
    deployState: { phase: "idle" },
    error: null,
  }
}

export function agentBuilderFlowReducer(
  state: AgentBuilderFlowState,
  event: AgentBuilderFlowEvent,
): AgentBuilderFlowState {
  switch (event.type) {
    case "PROMPT_CHANGED":
      return { ...state, prompt: event.value }
    case "PROMPT_SUBMITTED":
      return {
        ...state,
        step: "chat_review",
        prompt: event.prompt,
        submittedPrompt: event.prompt,
        error: null,
      }
    case "DRAFT_RECEIVED":
      return {
        ...state,
        step: "chat_review",
        draft: event.draft,
        blueprint: event.blueprint ?? state.blueprint,
        error: null,
      }
    case "DRAFT_PATCHED":
      return {
        ...state,
        draft: event.draft,
        blueprint: event.blueprint ?? state.blueprint,
        error: null,
      }
    case "TEMPLATE_SELECTED":
      return {
        ...state,
        step: "chat_review",
        selectedTemplateSlug: event.templateSlug,
        draft: event.draft ?? state.draft,
        blueprint: event.blueprint ?? state.blueprint,
        error: null,
      }
    case "CAPABILITY_SELECTED":
      return {
        ...state,
        selectedCapabilitySlugs: addUnique(state.selectedCapabilitySlugs, event.capabilitySlug),
      }
    case "CAPABILITY_REMOVED":
      return {
        ...state,
        selectedCapabilitySlugs: state.selectedCapabilitySlugs.filter((slug) => slug !== event.capabilitySlug),
      }
    case "GUIDED_STEP_SKIPPED":
      return {
        ...state,
        skippedStepIds: addUnique(state.skippedStepIds, event.stepId),
      }
    case "CONNECTION_REQUIREMENTS_RESOLVED":
      return withConnectionRequirements(state, event.requirements)
    case "CONNECT_APPS_OPENED":
      return { ...state, step: "connect_apps" }
    case "CONNECTION_STARTED":
      return {
        ...state,
        connectionStateByProvider: {
          ...state.connectionStateByProvider,
          [event.providerId]: { status: "connecting" },
        },
      }
    case "CONNECTION_COMPLETED":
      return {
        ...state,
        connectionStateByProvider: {
          ...state.connectionStateByProvider,
          [event.providerId]: { status: "connected", bindingId: event.bindingId ?? null },
        },
      }
    case "CONNECTION_FAILED":
      return {
        ...state,
        connectionStateByProvider: {
          ...state.connectionStateByProvider,
          [event.providerId]: { status: "failed", error: event.message },
        },
      }
    case "CONNECTION_SKIPPED":
      return {
        ...state,
        connectionStateByProvider: {
          ...state.connectionStateByProvider,
          [event.providerId]: { status: "skipped" },
        },
      }
    case "READY":
      return { ...state, step: "done", error: null }
    case "DEPLOY_STARTED":
      return {
        ...state,
        step: "deploy",
        deployState: { phase: "deploying", label: event.label ?? state.deployState.label ?? null },
        error: null,
      }
    case "DEPLOY_PROGRESS":
      return {
        ...state,
        step: "deploy",
        deployState: { ...state.deployState, phase: event.phase, label: event.label ?? state.deployState.label ?? null },
      }
    case "DEPLOY_CREATED":
      return {
        ...state,
        step: "done",
        deployState: { ...state.deployState, phase: "created", result: event.result },
        error: null,
      }
    case "DEPLOY_FAILED":
      return {
        ...state,
        step: "failed",
        deployState: { ...state.deployState, phase: "failed", error: event.error },
        error: event.error,
      }
    case "RESET":
      return {
        ...state,
        step: "start",
        lifecycleId: event.lifecycleId,
        prompt: "",
        submittedPrompt: null,
        draft: null,
        blueprint: null,
        selectedTemplateSlug: null,
        selectedCapabilitySlugs: [],
        skippedStepIds: [],
        connectionRequirements: [],
        connectionStateByProvider: {},
        deployState: { phase: "idle" },
        error: null,
      }
    case "CLOSED":
      return state
  }
}

function withConnectionRequirements(
  state: AgentBuilderFlowState,
  requirements: BuilderConnectionRequirement[],
): AgentBuilderFlowState {
  const nextConnectionState = { ...state.connectionStateByProvider }
  for (const requirement of requirements) {
    nextConnectionState[requirement.providerId] ??= { status: "needs_connection" }
  }
  const hasUnresolved = requirements.some((requirement) => {
    const status = nextConnectionState[requirement.providerId]?.status
    return status !== "connected" && status !== "using_existing" && status !== "skipped"
  })
  return {
    ...state,
    step: hasUnresolved ? "connect_apps" : state.step,
    connectionRequirements: requirements,
    connectionStateByProvider: nextConnectionState,
  }
}

function addUnique(values: string[], value: string) {
  return values.includes(value) ? values : [...values, value]
}
