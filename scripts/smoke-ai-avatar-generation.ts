import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile(path: string) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key]) continue
    let value = rawValue.trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))

function hasUsableSecret(value: string | undefined): boolean {
  if (!value?.trim()) return false
  return !/placeholder|your[-_ ]?key|change[-_ ]?me|dummy|test-key|xxx/i.test(value)
}

async function main() {
  const allowWrites = process.env.AI_AVATAR_SMOKE_ALLOW_WRITES === 'true'
  const orgId = process.env.AI_AVATAR_SMOKE_ORG_ID
  const userId = process.env.AI_AVATAR_SMOKE_USER_ID
  const assistantId = process.env.AI_AVATAR_SMOKE_ASSISTANT_ID

  if (!allowWrites || !orgId || !userId || !assistantId) {
    console.log(JSON.stringify({
      status: 'skipped',
      reason: 'Set AI_AVATAR_SMOKE_ALLOW_WRITES=true plus AI_AVATAR_SMOKE_ORG_ID, AI_AVATAR_SMOKE_USER_ID, and AI_AVATAR_SMOKE_ASSISTANT_ID to run the write-path smoke.',
      checks: {
        allowWrites,
        orgId: Boolean(orgId),
        userId: Boolean(userId),
        assistantId: Boolean(assistantId),
        supabase: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        lucid: Boolean(process.env.LUCID_API_BASE_URL && process.env.LUCID_API_KEY) || Boolean(process.env.TRUSTGATE_BASE_URL && process.env.TRUSTGATE_API_KEY),
        openai: Boolean(process.env.OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY),
      },
    }, null, 2))
    return
  }

  const { generateAgentAvatar } = await import('../src/lib/ai/agent-avatar/generate')
  const { markAgentAvatarAssetCurrent, getCurrentAgentAvatarAsset } = await import('../src/lib/ai/agent-avatar/storage')
  const { supabase } = await import('../src/lib/db/client')

  process.env.AI_GENERATION_CONTROL_PLANE_ENABLED ||= 'true'
  process.env.AI_GENERATION_IMAGE_ENABLED ||= 'true'
  process.env.AI_GENERATION_AGENT_AVATAR_ENABLED ||= 'true'
  process.env.AI_IMAGE_DIRECT_OPENAI_FALLBACK_ENABLED ||= 'false'
  process.env.IMAGE_MODEL = process.env.IMAGE_MODEL || 'gpt-image-2'

  const hasPrimaryProvider =
    (hasUsableSecret(process.env.TRUSTGATE_API_KEY) && Boolean(process.env.TRUSTGATE_BASE_URL || process.env.IMAGE_BASE_URL)) ||
    (hasUsableSecret(process.env.LUCID_API_KEY) && Boolean(process.env.LUCID_API_BASE_URL))
  const hasOpenAIProvider = hasUsableSecret(process.env.OPENAI_IMAGE_API_KEY || process.env.OPENAI_API_KEY)
  const directOpenAIFallbackEnabled = process.env.AI_IMAGE_DIRECT_OPENAI_FALLBACK_ENABLED === 'true'

  if (!hasPrimaryProvider && (!hasOpenAIProvider || !directOpenAIFallbackEnabled)) {
    throw new Error('No TrustGate/Lucid image provider is configured for the smoke. Set AI_IMAGE_DIRECT_OPENAI_FALLBACK_ENABLED=true only for an explicit direct OpenAI fallback smoke.')
  }

  if (!hasPrimaryProvider && process.env.AI_AVATAR_SMOKE_REQUIRE_PRIMARY === 'true') {
    throw new Error('TrustGate/Lucid primary provider is not configured for the smoke.')
  }

  process.env.IMAGE_PROVIDER = hasPrimaryProvider ? 'trustgate' : 'openai'
  const primary = await generateAgentAvatar({
    assistantId,
    orgId,
    userId,
    name: 'Lucid Avatar Smoke',
    role: 'Smoke test agent',
    description: 'A production smoke test for the agent avatar generation path.',
    stylePreset: 'lucid-studio',
    angle: 'front-three-quarter',
    crop: 'head-and-shoulders',
    expression: 'warm',
    background: 'clean-light',
    lighting: 'soft-studio',
    lockIdentity: false,
    promptVersion: 'agent-avatar-v1',
  })

  process.env.IMAGE_PROVIDER = hasPrimaryProvider ? 'trustgate' : 'openai'
  const regenerated = await generateAgentAvatar({
    assistantId,
    orgId,
    userId,
    name: 'Lucid Avatar Smoke',
    role: 'Smoke test agent',
    description: 'Regenerate this avatar while keeping the same face and profile picture framing.',
    stylePreset: 'lucid-studio',
    angle: 'front-three-quarter',
    crop: 'head-and-shoulders',
    expression: 'confident',
    background: 'subtle-depth',
    lighting: 'cinematic-soft',
    referenceAssetId: primary.id,
    referenceImageUrl: primary.url,
    lockIdentity: true,
    promptVersion: 'agent-avatar-v1',
  })

  const accepted = await markAgentAvatarAssetCurrent({
    assetId: regenerated.id,
    assistantId,
    orgId,
  })

  const current = await getCurrentAgentAvatarAsset(assistantId)
  const { data: events, error: eventError } = await supabase
    .from('ai_generation_events')
    .select('id, feature, success, metadata, created_at')
    .eq('metadata->>assistantId', assistantId)
    .eq('feature', 'agent-avatar-generation')
    .order('created_at', { ascending: false })
    .limit(5)

  if (eventError) throw eventError

  const { data: launchedAgent, error: launchedError } = await supabase
    .from('launched_agents')
    .select('id, avatar_url')
    .eq('assistant_id', assistantId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (launchedError) throw launchedError

  console.log(JSON.stringify({
    status: hasPrimaryProvider
      ? 'passed'
      : 'passed_openai_only_primary_unconfigured',
    primaryProviderConfigured: hasPrimaryProvider,
    primary: { id: primary.id, provider: primary.provider, model: primary.model },
    regenerated: { id: regenerated.id, provider: regenerated.provider, model: regenerated.model },
    accepted: { id: accepted.id, urlMatchesCurrent: accepted.url === current?.url },
    events: {
      count: events?.length ?? 0,
      latestSuccess: events?.[0]?.success === true,
    },
    launchedAgent: launchedAgent
      ? { id: launchedAgent.id, avatarUrlUpdated: launchedAgent.avatar_url === accepted.url }
      : { present: false },
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
