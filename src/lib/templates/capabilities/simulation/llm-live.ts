import type { LucidPackManifest } from '@contracts/lucid-pack'
import type { LiveWeb3MarketSnapshot } from './live-market'
import type { Web3SimulationScenario } from './web3-fixtures'

export interface LlmLiveSimulationConfig {
  baseUrl: string
  apiKey: string
  model: string
  providerLabel: string
}

export interface LlmLiveSimulationResult {
  answerText: string
  latencyMs: number
  providerLabel: string
  model: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

export function resolveLlmLiveSimulationConfig(): LlmLiveSimulationConfig | null {
  return resolveLlmLiveSimulationConfigs()[0] ?? null
}

export function resolveLlmLiveSimulationConfigs(): LlmLiveSimulationConfig[] {
  const lucidKey = process.env.LUCID_API_KEY?.trim()
  const trustgateKey = process.env.TRUSTGATE_API_KEY?.trim()
  const openAiKey = process.env.OPENAI_API_KEY?.trim()
  const enableLucidSimulationProvider = process.env.CAPABILITY_TEMPLATE_LLM_ENABLE_LUCID === 'true'
  const model = process.env.CAPABILITY_TEMPLATE_LLM_MODEL
    ?? process.env.LUCID_LLM_MODEL
    ?? process.env.OPENAI_MODEL
    ?? 'gpt-4o-mini'
  const configs: LlmLiveSimulationConfig[] = []
  if (lucidKey && enableLucidSimulationProvider) {
    configs.push({
      baseUrl: normalizeBaseUrl(
        process.env.CAPABILITY_TEMPLATE_LLM_BASE_URL
          ?? process.env.LUCID_API_BASE_URL
          ?? process.env.FALLBACK_PROVIDER_URL
          ?? 'https://api.lucid.foundation/v1',
      ),
      apiKey: lucidKey,
      model,
      providerLabel: 'lucid',
    })
  }
  if (trustgateKey) {
    configs.push({
      baseUrl: normalizeBaseUrl(
        process.env.CAPABILITY_TEMPLATE_LLM_BASE_URL
          ?? process.env.TRUSTGATE_BASE_URL
          ?? process.env.FALLBACK_PROVIDER_URL
          ?? 'https://api.lucid.foundation/v1',
      ),
      apiKey: trustgateKey,
      model,
      providerLabel: 'trustgate',
    })
  }
  if (openAiKey) {
    configs.push({
      baseUrl: normalizeBaseUrl('https://api.openai.com/v1'),
      apiKey: openAiKey,
      model,
      providerLabel: 'openai',
    })
  }
  return configs
}

export async function runLlmLiveWeb3TemplateSimulation(input: {
  manifest: LucidPackManifest
  scenario: Web3SimulationScenario
  liveSnapshot: LiveWeb3MarketSnapshot
  config: LlmLiveSimulationConfig
  timeoutMs?: number
}): Promise<LlmLiveSimulationResult> {
  const startedAt = Date.now()
  const response = await fetchWithTimeout(`${input.config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.config.model,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: [
            'You are Lucid running a production-readiness simulation for a Web3 capability template.',
            'Use only the supplied evidence. Do not claim to execute trades, transfers, swaps, orders, or wallet actions.',
            'Return exactly these Markdown headings: Summary, Findings, Evidence, Risks, Next actions.',
            'The Summary section must include the literal phrase "Read-only simulation".',
            'The Evidence section must include a "Live evidence anchors" bullet list and copy every supplied liveEvidenceAnchor value verbatim.',
            'Do not round, reformat, paraphrase, or omit any liveEvidenceAnchor values; evidence anchors are proof strings, not prose.',
            'The Risks section must include approval or read-only safety language, even for read-only research templates.',
            'The Next actions section must include 2-4 concrete bullet points, one bullet must include the literal phrase "Open Mission Control".',
            'Do not answer the Next actions section with only "Mission Control"; it must be useful operator guidance.',
            'If expected terms are supplied, include every expected term verbatim at least once where factual.',
            'If an expected term would otherwise be missing, add it to an Evidence bullet named "Required terms covered".',
            'Every answer must mention Mission Control, provenance, and approval/read-only safety.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            template: {
              key: input.manifest.key,
              name: input.manifest.name,
              description: input.manifest.description,
            },
            userPrompt: input.scenario.prompt,
            expectedTerms: input.scenario.expectedTerms,
            fixtureSignals: input.scenario.signals,
            fixtureEvidence: input.scenario.evidence,
            liveMarketSnapshot: redactLiveSnapshot(input.liveSnapshot),
            liveEvidenceAnchors: buildLiveEvidenceAnchors(input.liveSnapshot),
            requiredOutput: ['Summary', 'Findings', 'Evidence', 'Risks', 'Next actions'],
            requiredSafetyPhrases: ['Read-only simulation', 'Mission Control'],
          }, null, 2),
        },
      ],
    }),
  }, input.timeoutMs ?? 45_000)

  const latencyMs = Date.now() - startedAt
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`LLM live simulation failed with HTTP ${response.status}: ${summarizeErrorBody(text)}`)
  }
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
  }
  const answerText = payload.choices?.[0]?.message?.content?.trim()
  if (!answerText) throw new Error('LLM live simulation returned an empty answer')

  return {
    answerText,
    latencyMs,
    providerLabel: input.config.providerLabel,
    model: input.config.model,
    usage: payload.usage
      ? {
          promptTokens: payload.usage.prompt_tokens,
          completionTokens: payload.usage.completion_tokens,
          totalTokens: payload.usage.total_tokens,
        }
      : undefined,
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
}

function redactLiveSnapshot(snapshot: LiveWeb3MarketSnapshot): LiveWeb3MarketSnapshot {
  return {
    ...snapshot,
    ethereum: snapshot.ethereum
      ? {
          ...snapshot.ethereum,
          rpcUrl: snapshot.ethereum.rpcUrl.replace(/([?&](api_)?key=)[^&]+/i, '$1[redacted]'),
        }
      : undefined,
  }
}

function summarizeErrorBody(text: string): string {
  const title = text.match(/<title>(.*?)<\/title>/i)?.[1]
  const summary = title ?? text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return summary.slice(0, 180)
}

function buildLiveEvidenceAnchors(snapshot: LiveWeb3MarketSnapshot): string[] {
  return [
    snapshot.ethereum ? `ethereum` : null,
    snapshot.ethereum ? String(snapshot.ethereum.blockNumber) : null,
    snapshot.dex ? `dexscreener` : null,
    snapshot.dex?.baseSymbol,
    snapshot.dex?.quoteSymbol,
    snapshot.dex?.priceUsd,
    snapshot.predictionMarket ? `polymarket` : null,
    snapshot.predictionMarket?.question.split(/\s+/).slice(0, 4).join(' '),
  ].filter((value): value is string => Boolean(value && value.trim().length > 0))
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}
