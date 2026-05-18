import 'server-only'
import { normalizeMcpgateSkillPassport, type SkillPackage } from './package'

const DEFAULT_TIMEOUT_MS = 10_000

function getBaseUrl() {
  return process.env.MCPGATE_URL || process.env.MCPGATE_API_URL || null
}

function getHeaders() {
  const apiKey = process.env.MCPGATE_API_KEY
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }
}

export async function listMcpgateSkills(): Promise<SkillPackage[]> {
  const baseUrl = getBaseUrl()
  if (!baseUrl) return []

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}/v1/skills`, {
      headers: getHeaders(),
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) {
      throw new Error(`MCPGate skills list failed: ${response.status}`)
    }
    const payload = await response.json() as { items?: unknown[] }
    const items = Array.isArray(payload.items) ? payload.items : []
    return items.map(item => normalizeMcpgateSkill(item)).filter((item): item is SkillPackage => item !== null)
  } finally {
    clearTimeout(timeout)
  }
}

export function normalizeMcpgateSkill(input: unknown): SkillPackage | null {
  return normalizeMcpgateSkillPassport(input)
}

export async function upsertMcpgateSkill(
  skill: SkillPackage,
  existing: SkillPackage | null,
): Promise<void> {
  const baseUrl = getBaseUrl()
  if (!baseUrl) {
    throw new Error('MCPGate URL is not configured')
  }

  const endpoint = existing ? `/v1/skills/${existing.id}` : '/v1/skills'
  const method = existing ? 'PUT' : 'POST'

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: getHeaders(),
      signal: controller.signal,
      cache: 'no-store',
      body: JSON.stringify({
        name: skill.name,
        slug: skill.slug,
        description: skill.description ?? undefined,
        category: skill.category,
        tags: skill.tags,
        summary: skill.summary ?? undefined,
        version: skill.version,
        trust_tier: skill.trust_tier,
        capability_tier: skill.capability_tier,
        skill_markdown: skill.skill_markdown,
        variants: skill.variants,
        artifact_manifest: skill.artifact_manifest ?? undefined,
      }),
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(`MCPGate skill upsert failed: ${response.status} ${message}`.trim())
    }
  } finally {
    clearTimeout(timeout)
  }
}
