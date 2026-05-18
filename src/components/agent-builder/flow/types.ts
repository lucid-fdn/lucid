"use client"

import type { ProjectBlueprint } from "@contracts/project-blueprint"
import type { TemplateCatalogEntry } from "@contracts/template"
import type { UnifiedSkillItem } from "@contracts/unified-skill"
import type { GenerationDraft } from "@/lib/ai/project-generation/schemas"
import type {
  CreateAgentFromBuilderDraftResult,
} from "@/lib/agent-builder/create-agent-from-builder-draft"

export type AgentBuilderFlowMode = "project" | "project-with-agent" | "agent"

export type AgentBuilderFlowStep =
  | "start"
  | "chat_review"
  | "connect_apps"
  | "deploy"
  | "done"
  | "failed"

export type AgentBuilderFlowSurface =
  | "page"
  | "canvas_node"
  | "canvas_overlay"
  | "modal"
  | "drawer"

export type BuilderDeployPhase = "idle" | "deploying" | "connecting" | "creating" | "created" | "failed"

export interface BuilderDeployState {
  phase: BuilderDeployPhase
  label?: string | null
  error?: string | null
  result?: CreateAgentFromBuilderDraftResult | null
}

export interface BuilderConnectionRequirement {
  slug: string
  providerId: string
  label: string
  logoUrl?: string | null
}

export type BuilderConnectionStatus = "needs_connection" | "connecting" | "connected" | "using_existing" | "skipped" | "failed"

export interface BuilderConnectionState {
  status: BuilderConnectionStatus
  bindingId?: string | null
  error?: string | null
}

export interface AgentBuilderFlowConfig {
  mode: AgentBuilderFlowMode
  workspaceId: string
  workspaceSlug: string
  targetProjectId?: string | null
  targetProjectSlug?: string | null
  initialPrompt?: string | null
  initialTemplateSlug?: string | null
  catalogTemplates: TemplateCatalogEntry[]
  availableUnifiedSkills: UnifiedSkillItem[]
  initialDraft?: GenerationDraft | null
  persistence?: "local" | "session"
  surface?: AgentBuilderFlowSurface
  onCreated?: (result: CreateAgentFromBuilderDraftResult) => void
  onClose?: () => void
}

export interface AgentBuilderFlowState {
  step: AgentBuilderFlowStep
  mode: AgentBuilderFlowMode
  surface: AgentBuilderFlowSurface
  lifecycleId: string
  prompt: string
  submittedPrompt: string | null
  draft: GenerationDraft | null
  blueprint: ProjectBlueprint | null
  selectedTemplateSlug: string | null
  selectedCapabilitySlugs: string[]
  skippedStepIds: string[]
  connectionRequirements: BuilderConnectionRequirement[]
  connectionStateByProvider: Record<string, BuilderConnectionState>
  deployState: BuilderDeployState
  error: string | null
}

export type AgentBuilderFlowEvent =
  | { type: "PROMPT_CHANGED"; value: string }
  | { type: "PROMPT_SUBMITTED"; prompt: string }
  | { type: "DRAFT_RECEIVED"; draft: GenerationDraft; blueprint?: ProjectBlueprint | null }
  | { type: "DRAFT_PATCHED"; draft: GenerationDraft; blueprint?: ProjectBlueprint | null }
  | { type: "TEMPLATE_SELECTED"; templateSlug: string; draft?: GenerationDraft | null; blueprint?: ProjectBlueprint | null }
  | { type: "CAPABILITY_SELECTED"; capabilitySlug: string }
  | { type: "CAPABILITY_REMOVED"; capabilitySlug: string }
  | { type: "GUIDED_STEP_SKIPPED"; stepId: string }
  | { type: "CONNECTION_REQUIREMENTS_RESOLVED"; requirements: BuilderConnectionRequirement[] }
  | { type: "CONNECTION_STARTED"; providerId: string }
  | { type: "CONNECTION_COMPLETED"; providerId: string; bindingId?: string | null }
  | { type: "CONNECTION_FAILED"; providerId: string; message: string }
  | { type: "CONNECTION_SKIPPED"; providerId: string }
  | { type: "CONNECT_APPS_OPENED" }
  | { type: "READY" }
  | { type: "DEPLOY_STARTED"; label?: string | null }
  | { type: "DEPLOY_PROGRESS"; phase: Exclude<BuilderDeployPhase, "idle" | "created" | "failed">; label?: string | null }
  | { type: "DEPLOY_CREATED"; result: CreateAgentFromBuilderDraftResult }
  | { type: "DEPLOY_FAILED"; error: string }
  | { type: "RESET"; lifecycleId: string }
  | { type: "CLOSED" }

export interface AgentBuilderFlowActions {
  setPrompt(value: string): void
  submitPrompt(prompt?: string): void
  receiveDraft(draft: GenerationDraft, blueprint?: ProjectBlueprint | null): void
  patchDraft(draft: GenerationDraft, blueprint?: ProjectBlueprint | null): void
  selectTemplate(template: TemplateCatalogEntry, draft?: GenerationDraft | null, blueprint?: ProjectBlueprint | null): void
  selectCapability(slug: string): void
  removeCapability(slug: string): void
  setConnectionRequirements(requirements: BuilderConnectionRequirement[]): void
  openConnectApps(): void
  markConnectionStarted(providerId: string): void
  markConnectionCompleted(providerId: string, bindingId?: string | null): void
  markConnectionFailed(providerId: string, message: string): void
  skipConnection(providerId: string): void
  markReady(): void
  markDeployStarted(label?: string | null): void
  markDeployProgress(phase: Exclude<BuilderDeployPhase, "idle" | "created" | "failed">, label?: string | null): void
  markDeployCreated(result: CreateAgentFromBuilderDraftResult): void
  markDeployFailed(error: unknown): void
  close(): void
  reset(): void
}

export interface AgentBuilderFlowContextValue extends AgentBuilderFlowState {
  config: AgentBuilderFlowConfig
  actions: AgentBuilderFlowActions
  canClose: boolean
  canDeploy: boolean
  unresolvedConnections: BuilderConnectionRequirement[]
}
