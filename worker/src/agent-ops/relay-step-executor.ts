import crypto from 'node:crypto'

import { getWorkerLlmConfig } from '../ai/lucid-provider-config.js'
import type { Config } from '../config.js'
import { defaultWorkerRunExecutor, type WorkerRunExecutor } from '../core/runtime/worker-run-executor.js'
import type { StepExecutor, StepExecutionResult } from '../processors/relay-step.js'
import type { DataSink, StepRunPacket } from '../runtime/data-sink.js'
import { requestApproval } from '../runtime/approval-client.js'
import { reportEvent } from '../runtime/event-reporter.js'
import { buildBrowserQaInstructions } from './browser-qa.js'
import { maybeExecuteBrowserQaStep } from './browser-qa-executor.js'

interface AgentOpsRelayStepExecutorOptions {
  config: Config
  runExecutor?: WorkerRunExecutor
  dataSink?: DataSink
  approvalPollIntervalMs?: number
}

export class AgentOpsRelayStepExecutor implements StepExecutor {
  private readonly config: Config
  private readonly runExecutor: WorkerRunExecutor
  private readonly dataSink: DataSink | null
  private readonly approvalPollIntervalMs: number | undefined

  constructor(options: AgentOpsRelayStepExecutorOptions) {
    this.config = options.config
    this.runExecutor = options.runExecutor ?? defaultWorkerRunExecutor
    this.dataSink = options.dataSink ?? null
    this.approvalPollIntervalMs = options.approvalPollIntervalMs
  }

  async execute(packet: StepRunPacket): Promise<StepExecutionResult> {
    const payload = asRecord(packet.payload)
    const agentOps = asRecord(payload?.agent_ops)

    if (!agentOps) {
      return {
        ok: true,
        output: '[relay-step] no Agent Ops context; step acknowledged by fallback executor',
      }
    }

    const assistant = packet.assistantConfig
    if (!assistant) {
      return {
        ok: false,
        errorMessage: 'Agent Ops step is missing assistantConfig',
        retryable: false,
      }
    }

    const localRunId = crypto.randomUUID()
    const runId = getString(agentOps.run_id) ?? localRunId
    const started = Date.now()

    if (packet.stepType === 'approval') {
      return this.executeApprovalStep(packet, payload ?? {}, agentOps, assistant, runId, started)
    }

    reportEvent({
      agentId: assistant.id,
      eventType: 'run_started',
      severity: 'info',
      payload: {
        runId: localRunId,
        agentOpsRunId: runId,
        source: 'agent_ops_relay_step',
        dagId: packet.dagId,
        dagNodeId: packet.dagNodeId,
        stepId: packet.stepId,
      },
    })

    try {
      const browserQaResult = await maybeExecuteBrowserQaStep({
        packet,
        payload: payload ?? {},
        agentOps,
        config: this.config,
      })
      if (browserQaResult) {
        reportEvent({
          agentId: assistant.id,
          eventType: browserQaResult.ok ? 'run_finished' : 'error',
          severity: browserQaResult.ok ? 'info' : 'error',
          payload: {
            runId: localRunId,
            agentOpsRunId: runId,
            source: 'agent_ops_browser_qa_executor',
            dagId: packet.dagId,
            dagNodeId: packet.dagNodeId,
            stepId: packet.stepId,
            durationMs: browserQaResult.ok
              ? browserQaResult.durationMs ?? Date.now() - started
              : Date.now() - started,
          },
        })
        return browserQaResult
      }

      const result = await this.runExecutor.execute({
        assistant: {
          id: assistant.id,
          name: assistant.name,
          engine: assistant.engine ?? 'openclaw',
          runtime_flavor: assistant.runtimeFlavor ?? 'c1_managed',
          system_prompt: assistant.systemPrompt,
          soul_content: assistant.soulContent ?? null,
          lucid_model: assistant.modelId,
          temperature: assistant.temperature,
          max_tokens: assistant.maxTokens,
          memory_enabled: assistant.memoryEnabled,
          memory_window_size: 20,
          org_id: assistant.orgId,
          policy_config: assistant.policyConfig,
          passport_id: null,
          wallet_enabled: false,
          agent_wallets: [],
          approval_required_tools: assistant.approvalRequiredTools,
        },
        conversationId: `agent-ops:${runId}:${packet.dagNodeId}`,
        messages: [],
        memories: packet.memoryInjection ?? [],
        boardMemories: packet.boardMemories ?? [],
        userMessage: buildAgentOpsStepPrompt(packet, payload ?? {}, agentOps),
        budget: {
          maxLlmCalls: this.config.DEFAULT_MAX_LLM_CALLS,
          maxToolCalls: this.config.DEFAULT_MAX_TOOL_CALLS,
          maxWallTimeMs: this.config.DEFAULT_MAX_WALL_TIME_MS,
        },
        runId: localRunId,
        userId: getString(agentOps.requested_by_user_id) ?? 'agent-ops',
        llmConfig: getWorkerLlmConfig(this.config),
      })

      const durationMs = Date.now() - started
      const output = result.text?.trim() || '[No Agent Ops step output generated]'

      reportEvent({
        agentId: assistant.id,
        eventType: 'run_finished',
        severity: 'info',
        payload: {
          runId: localRunId,
          agentOpsRunId: runId,
          source: 'agent_ops_relay_step',
          dagId: packet.dagId,
          dagNodeId: packet.dagNodeId,
          stepId: packet.stepId,
          durationMs,
          tokens: result.usage.totalTokens,
        },
      })

      if (result.providerError) {
        return {
          ok: false,
          errorMessage: output,
          retryable: true,
        }
      }

      return {
        ok: true,
        output,
        durationMs,
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      reportEvent({
        agentId: assistant.id,
        eventType: 'error',
        severity: 'error',
        payload: {
          runId: localRunId,
          agentOpsRunId: runId,
          source: 'agent_ops_relay_step',
          dagId: packet.dagId,
          dagNodeId: packet.dagNodeId,
          stepId: packet.stepId,
          error: errorMessage,
        },
      })

      return {
        ok: false,
        errorMessage,
        retryable: true,
      }
    }
  }

  private async executeApprovalStep(
    packet: StepRunPacket,
    payload: Record<string, unknown>,
    agentOps: Record<string, unknown>,
    assistant: NonNullable<StepRunPacket['assistantConfig']>,
    runId: string,
    started: number,
  ): Promise<StepExecutionResult> {
    if (!this.dataSink?.submitApproval || !this.dataSink.pollApprovalResolution) {
      return {
        ok: false,
        errorMessage: 'Agent Ops approval step requires DataSink approval support',
        retryable: false,
      }
    }

    const stepId = getString(agentOps.step_id) ?? getString(payload.agent_ops_step) ?? packet.dagNodeId
    const stepTitle = getString(agentOps.step_title) ?? stepId
    const toolName = `agent_ops.${getString(agentOps.workflow_id) ?? 'workflow'}.${stepId}`
    const timeoutMs = 30 * 60 * 1000

    reportEvent({
      agentId: assistant.id,
      eventType: 'run_started',
      severity: 'info',
      payload: {
        runId,
        agentOpsRunId: runId,
        source: 'agent_ops_approval_step',
        dagId: packet.dagId,
        dagNodeId: packet.dagNodeId,
        stepId: packet.stepId,
        approvalStepId: stepId,
      },
    })

    try {
      const resolution = await requestApproval(this.dataSink, {
        agentId: assistant.id,
        toolName,
        toolArgs: {
          workflow_id: agentOps.workflow_id,
          workflow_version: agentOps.workflow_version,
          step_id: stepId,
          step_title: stepTitle,
          scope: agentOps.scope ?? {},
          input: agentOps.input ?? {},
          dag_id: packet.dagId,
          dag_node_id: packet.dagNodeId,
          runtime_step_id: packet.stepId,
          reason: `Approve Agent Ops step: ${stepTitle}`,
        },
        runId,
        timeoutMs,
        pollIntervalMs: this.approvalPollIntervalMs,
      })

      if (resolution.decision !== 'approved') {
        reportEvent({
          agentId: assistant.id,
          eventType: 'error',
          severity: 'warning',
          payload: {
            runId,
            agentOpsRunId: runId,
            source: 'agent_ops_approval_step',
            dagId: packet.dagId,
            dagNodeId: packet.dagNodeId,
            stepId: packet.stepId,
            approvalStepId: stepId,
            decision: resolution.decision,
            resolvedAt: resolution.resolvedAt,
            durationMs: Date.now() - started,
          },
        })
        return {
          ok: false,
          errorMessage: `Agent Ops approval ${resolution.decision}: ${stepTitle}`,
          retryable: false,
        }
      }

      const output = {
        summary: `Approval granted for ${stepTitle}.`,
        findings: [],
        evidence: [
          {
            type: 'approval',
            title: `Approval granted: ${stepTitle}`,
            summary: `Decision approved at ${resolution.resolvedAt}.`,
            content: {
              decision: resolution.decision,
              resolved_at: resolution.resolvedAt,
              tool_name: toolName,
              step_id: stepId,
              step_title: stepTitle,
            },
          },
        ],
        risks: [],
        next_actions: ['Continue the Agent Ops workflow.'],
      }

      reportEvent({
        agentId: assistant.id,
        eventType: 'run_finished',
        severity: 'info',
        payload: {
          runId,
          agentOpsRunId: runId,
          source: 'agent_ops_approval_step',
          dagId: packet.dagId,
          dagNodeId: packet.dagNodeId,
          stepId: packet.stepId,
          approvalStepId: stepId,
          decision: resolution.decision,
          resolvedAt: resolution.resolvedAt,
          durationMs: Date.now() - started,
        },
      })

      return {
        ok: true,
        output: JSON.stringify(output),
        durationMs: Date.now() - started,
      }
    } catch (error) {
      reportEvent({
        agentId: assistant.id,
        eventType: 'error',
        severity: 'error',
        payload: {
          runId,
          agentOpsRunId: runId,
          source: 'agent_ops_approval_step',
          dagId: packet.dagId,
          dagNodeId: packet.dagNodeId,
          stepId: packet.stepId,
          approvalStepId: stepId,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - started,
        },
      })
      return {
        ok: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        retryable: true,
      }
    }
  }
}

export function createRelayStepExecutor(
  config: Config,
  dataSink?: DataSink,
  options: Pick<AgentOpsRelayStepExecutorOptions, 'approvalPollIntervalMs'> = {},
): StepExecutor {
  return new AgentOpsRelayStepExecutor({ config, dataSink, ...options })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function buildAgentOpsStepPrompt(
  packet: StepRunPacket,
  payload: Record<string, unknown>,
  agentOps: Record<string, unknown>,
): string {
  const workflowId = getString(agentOps.workflow_id) ?? 'unknown'
  const workflowVersion = getString(agentOps.workflow_version) ?? 'unknown'
  const stepId = getString(agentOps.step_id) ?? getString(payload.agent_ops_step) ?? packet.dagNodeId
  const stepTitle = getString(agentOps.step_title) ?? stepId
  const outputSections = Array.isArray(agentOps.output_sections)
    ? agentOps.output_sections.join(', ')
    : 'Summary, Findings, Evidence, Risks, Next actions'
  const evidenceTypes = Array.isArray(agentOps.evidence_types)
    ? agentOps.evidence_types.join(', ')
    : 'evidence relevant to the workflow'
  const browserQaInstructions = buildBrowserQaInstructions({
    workflowId,
    stepId,
    agentOps,
  })
  const failureOwnershipInstructions = buildFailureOwnershipInstructions(workflowId)

  return [
    'You are executing one step in a Lucid Agent Ops workflow.',
    '',
    `Workflow: ${workflowId} (${workflowVersion})`,
    `Step: ${stepId} - ${stepTitle}`,
    `DAG: ${packet.dagId}`,
    '',
    'Run only this step. Be concise, evidence-backed, and do not claim unrelated steps are complete.',
    'Return ONLY valid JSON. Do not wrap it in markdown.',
    'The JSON object must have this shape: {"summary": string, "findings": [], "evidence": [], "risks": [], "next_actions": []}.',
    'Each finding should include severity, title, body, optional file_path/start_line/end_line/confidence/fingerprint/metadata.',
    ...(failureOwnershipInstructions ? [failureOwnershipInstructions] : []),
    'Each evidence item should include type, title, optional summary/uri/content/checksum.',
    `Use these output sections when relevant: ${outputSections}.`,
    `Collect or cite these evidence types when available: ${evidenceTypes}.`,
    ...(browserQaInstructions ? ['', browserQaInstructions] : []),
    '',
    'Workflow scope:',
    safeJson(agentOps.scope ?? {}),
    '',
    'Workflow input:',
    safeJson(agentOps.input ?? {}),
    '',
    'Step payload:',
    safeJson(payload),
  ].join('\n')
}

function buildFailureOwnershipInstructions(workflowId: string): string | null {
  if (!['qa', 'ship', 'canary', 'retro'].includes(workflowId)) return null
  return [
    'For QA, Ship, Canary, and Retro findings, include metadata.failure_ownership whenever a failure, regression, release risk, or follow-up is reported.',
    'Use one kind from: pre_existing_issue, agent_mistake, human_handoff, infra_issue, flaky_test, product_bug.',
    'The object should include kind, confidence, reason, owner when known, and requires_human when a human follow-up is needed.',
  ].join(' ')
}
