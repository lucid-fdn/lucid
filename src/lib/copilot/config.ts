/**
 * Copilot — Configuration
 *
 * Centralized, switchable configuration for the Mission Control AI Copilot.
 * Model, temperature, and limits are all configurable via env vars with sane defaults.
 *
 * Env vars:
 *   COPILOT_MODEL        — Model ID (default: gpt-4o). Switchable without code change.
 *   COPILOT_MAX_TOKENS   — Max output tokens (default: 4096)
 *   COPILOT_TEMPERATURE  — Temperature 0-1 (default: 0.2)
 *   COPILOT_MAX_STEPS    — Max tool-call roundtrips (default: 5)
 */

import type { CopilotConfig } from './types'

const DEFAULT_MODEL = 'gpt-4o'
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_TEMPERATURE = 0.2
const DEFAULT_MAX_STEPS = 5

export function getCopilotConfig(): CopilotConfig {
  return {
    modelId: process.env.COPILOT_MODEL || DEFAULT_MODEL,
    maxTokens: Number(process.env.COPILOT_MAX_TOKENS) || DEFAULT_MAX_TOKENS,
    temperature: Number(process.env.COPILOT_TEMPERATURE) || DEFAULT_TEMPERATURE,
    maxSteps: Number(process.env.COPILOT_MAX_STEPS) || DEFAULT_MAX_STEPS,
  }
}
