import type { CodexReviewShard } from './audit-types'
import { walkFiles, writeMarkdown, writeJson } from './audit-utils'

interface ShardDefinition {
  id: string
  title: string
  subsystem: string
  patterns: RegExp[]
  riskChecklist: string[]
  suggestedCommands: string[]
}

const SHARDS: ShardDefinition[] = [
  {
    id: 'auth-access-control',
    title: 'Auth, Sessions, Access Control, CSRF',
    subsystem: 'trust',
    patterns: [/^src\/lib\/auth\//, /^src\/lib\/access-control\//, /^src\/lib\/request-context\//, /^src\/middleware\.ts$/, /csrf/i],
    riskChecklist: ['auth bypass', 'CSRF gaps', 'session confusion', 'service-role leakage', 'tenant isolation'],
    suggestedCommands: ['npm run app-service:boundaries', 'npm run test -- --run src/lib/auth'],
  },
  {
    id: 'api-routes-webhooks',
    title: 'API Routes And Webhooks',
    subsystem: 'api',
    patterns: [/^src\/app\/api\//],
    riskChecklist: ['route auth', 'webhook signature verification', 'request validation', 'response redaction', 'rate limits'],
    suggestedCommands: ['npm run test:channels:smoke', 'npm run check:pr'],
  },
  {
    id: 'db-supabase-rls',
    title: 'DB Helpers, Supabase, RLS Migrations',
    subsystem: 'data',
    patterns: [/^src\/lib\/db\//, /^src\/lib\/supabase\//, /^supabase\/migrations\//, /^migrations\//],
    riskChecklist: ['RLS gaps', 'tenant boundary', 'security definer search_path', 'slow queries', 'service-role misuse'],
    suggestedCommands: ['npm run test:db:quick', 'npm run knowledge:production-hardening:check'],
  },
  {
    id: 'channels',
    title: 'Channels: Slack, Discord, Telegram, WhatsApp, Teams, iMessage',
    subsystem: 'channels',
    patterns: [/\/channels\//, /\/discord\//, /\/telegram\//, /\/whatsapp\//, /\/imessage\//, /msteams/i, /^worker\/src\/channels\//],
    riskChecklist: ['duplicate delivery logic', 'streaming/chunking regressions', 'agent routing drift', 'secret handling', 'ack latency'],
    suggestedCommands: ['npm run test:channels:smoke:full', 'npm run env:audit:channels'],
  },
  {
    id: 'worker-pulse-processors',
    title: 'Worker Processors And Pulse Queues',
    subsystem: 'worker',
    patterns: [/^worker\/src\/processors\//, /^worker\/src\/pulse\//, /^worker\/src\/cron\//, /^worker\/src\/services\//],
    riskChecklist: ['queue dedupe', 'backpressure', 'split service modes', 'timeouts', 'retry safety'],
    suggestedCommands: ['npm --prefix worker run build', 'npm run agent-ops:stress'],
  },
  {
    id: 'agent-ops-mission-control',
    title: 'Agent Ops, Mission Control, Work Graph',
    subsystem: 'agent-ops',
    patterns: [/agent-ops/i, /mission-control/i, /work-graph/i],
    riskChecklist: ['run duplication', 'metadata correctness', 'policy gating', 'Mission Control data mismatch', 'operator UX'],
    suggestedCommands: ['npm run agent-ops:quality-gates', 'npm run work-graph:production-hardening'],
  },
  {
    id: 'browser-operator',
    title: 'Browser Operator And Browser Gateway',
    subsystem: 'browser',
    patterns: [/browser-operator/i, /browser-qa/i, /browser-checkout/i],
    riskChecklist: ['unsafe browser actions', 'provider lock-in', 'session leaks', 'credential exposure', 'checkout fail-closed'],
    suggestedCommands: ['npm run browser-checkout:adapter:conformance', 'npm run agent-ops:browser-provider-smoke -- --target https://www.lucid.foundation'],
  },
  {
    id: 'agent-commerce',
    title: 'Agent Commerce And Checkout Safety',
    subsystem: 'commerce',
    patterns: [/agent-commerce/i, /checkout/i, /purchase/i],
    riskChecklist: ['money movement', 'idempotency', 'approval enforcement', 'receipt truth', 'provider mismatch'],
    suggestedCommands: ['npm run agent-commerce:ga-final-local-gate', 'npm run agent-commerce:security-review-evidence'],
  },
  {
    id: 'knowledge-memory-rag',
    title: 'Knowledge, Memory, RAG, L2 Projection',
    subsystem: 'knowledge',
    patterns: [/knowledge/i, /memory/i, /brain/i, /rag/i, /lucid-l2/i],
    riskChecklist: ['tenant-scoped recall', 'prompt injection', 'provenance', 'semantic conflicts', 'encrypted memory visibility'],
    suggestedCommands: ['npm run check:knowledge'],
  },
  {
    id: 'templates-packs',
    title: 'Templates, Packs, Marketplace Authoring',
    subsystem: 'templates',
    patterns: [/templates/i, /packs/i, /marketplace/i],
    riskChecklist: ['Pack lifecycle drift', 'install/reconcile correctness', 'authoring validation', 'resource duplication', 'mock output'],
    suggestedCommands: ['npm run templates:validate', 'npm run templates:simulate', 'npm run capability-templates:validate'],
  },
  {
    id: 'runtime-compatibility',
    title: 'Runtime Compatibility: OpenClaw, Hermes, Shared, Dedicated, BYO',
    subsystem: 'runtime',
    patterns: [/openclaw/i, /hermes/i, /runtime/i, /byo/i, /^packages\/runtime/, /^packages\/openclaw/, /^packages\/hermes/],
    riskChecklist: ['engine coupling', 'capability drift', 'unsafe operator command', 'shared worker/browser violation', 'local agent compatibility'],
    suggestedCommands: ['npm run runtime:capability-drift', 'npm run runtime:operator-safety', 'npm run openclaw-runtime:typecheck'],
  },
  {
    id: 'ui-product-surfaces',
    title: 'UI Shell, Onboarding, Settings, Critical Product Surfaces',
    subsystem: 'ui',
    patterns: [/^src\/app\//, /^src\/components\//, /^src\/contexts\//, /^src\/hooks\//],
    riskChecklist: ['mock data leakage', 'dead CTAs', 'wrong counts', 'loading loops', 'accessibility', 'client/server boundary'],
    suggestedCommands: ['npm run test:e2e:smoke'],
  },
  {
    id: 'tests-scripts-ci-docs',
    title: 'Tests, Scripts, CI, Deploy, Env Docs',
    subsystem: 'dx',
    patterns: [/^scripts\//, /^tests\//, /^docs\//, /^\.github\//, /^package\.json$/, /config/i],
    riskChecklist: ['stale scripts', 'false-green tests', 'unsafe deploy scripts', 'secret docs', 'missing CI gates'],
    suggestedCommands: ['npm run test:inventory', 'npm run check:pr'],
  },
]

export async function buildCodexReviewShards(root: string): Promise<CodexReviewShard[]> {
  const files = await walkFiles(root, {
    includeExtensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.sql', '.md', '.json', '.yml', '.yaml'],
    includeGlobs: [/^(src|worker|packages|contracts|scripts|tests|docs|supabase|migrations|\.github)\//, /^package\.json$/, /^CLAUDE\.md$/, /^README\.md$/],
  })

  return SHARDS.map((definition) => {
    const shardFiles = files
      .filter((file) => definition.patterns.some((pattern) => pattern.test(file)))
      .slice(0, 400)
    return {
      id: definition.id,
      title: definition.title,
      subsystem: definition.subsystem,
      files: shardFiles,
      riskChecklist: definition.riskChecklist,
      suggestedCommands: definition.suggestedCommands,
      prompt: buildPrompt(definition, shardFiles),
    }
  })
}

export async function writeCodexReviewShards(root: string, markdownPath: string, jsonPath: string): Promise<CodexReviewShard[]> {
  const shards = await buildCodexReviewShards(root)
  await writeJson(root, jsonPath, shards)
  await writeMarkdown(root, markdownPath, renderShards(shards))
  return shards
}

function buildPrompt(definition: ShardDefinition, files: string[]): string {
  return [
    `Review the ${definition.title} subsystem for security bugs, vulnerabilities, tenant isolation issues, performance traps, dead code, duplicate logic, runtime coupling, and missing tests.`,
    'Prioritize actionable findings with file/line references. Ignore style-only issues unless they hide reliability, scalability, or security risk.',
    `Risk checklist: ${definition.riskChecklist.join(', ')}.`,
    `Representative files: ${files.slice(0, 40).join(', ')}${files.length > 40 ? ', ...' : ''}`,
  ].join('\n\n')
}

function renderShards(shards: CodexReviewShard[]): string {
  const lines = ['# Codex Review Shards', '']
  for (const shard of shards) {
    lines.push(
      `## ${shard.title}`,
      '',
      `- ID: \`${shard.id}\``,
      `- Subsystem: \`${shard.subsystem}\``,
      `- Files: ${shard.files.length}`,
      `- Suggested commands: ${shard.suggestedCommands.map((command) => `\`${command}\``).join(', ') || 'none'}`,
      '',
      '**Risk Checklist**',
      '',
      ...shard.riskChecklist.map((item) => `- ${item}`),
      '',
      '**Prompt**',
      '',
      '```txt',
      shard.prompt,
      '```',
      '',
      '**Files**',
      '',
      ...shard.files.slice(0, 120).map((file) => `- \`${file}\``),
      shard.files.length > 120 ? `- ... ${shard.files.length - 120} more files` : '',
      '',
    )
  }
  return lines.filter((line, index, arr) => line !== '' || arr[index - 1] !== '').join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeCodexReviewShards(
    process.cwd(),
    'docs/generated/codex-review-shards-2026-05-15.md',
    'docs/generated/codex-review-shards-2026-05-15.json',
  )
    .then((shards) => console.log(`Generated ${shards.length} Codex review shards.`))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
