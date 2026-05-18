import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const TARGET_ENV = (process.argv[2] || 'production').toLowerCase()
const DEFAULT_AUDIT_CWD = process.cwd()

const CHANNEL_REQUIREMENTS = {
  discord: [
    'FEATURE_DISCORD_HOSTED',
    'DISCORD_HOSTED_CLIENT_ID',
    'DISCORD_HOSTED_CLIENT_SECRET',
    'DISCORD_HOSTED_BOT_TOKEN',
    'DISCORD_HOSTED_PUBLIC_KEY',
    'DISCORD_HOSTED_STATE_SECRET',
    'DISCORD_HOSTED_INTERACTION_SECRET',
    'FEATURE_OPENCLAW_CHANNELS_DISCORD_MANAGED',
  ],
  slack: [
    'FEATURE_SLACK_HOSTED',
    'SLACK_HOSTED_CLIENT_ID',
    'SLACK_HOSTED_CLIENT_SECRET',
    'SLACK_HOSTED_APP_TOKEN',
    'SLACK_HOSTED_STATE_SECRET',
    'FEATURE_OPENCLAW_CHANNELS_SLACK_MANAGED',
  ],
  msteams: [
    'FEATURE_TEAMS_HOSTED',
    'MSTEAMS_HOSTED_INSTALL_URL',
    'MSTEAMS_HOSTED_APP_ID',
    'MSTEAMS_HOSTED_APP_PASSWORD',
    'MSTEAMS_HOSTED_TENANT_ID',
    'MSTEAMS_HOSTED_STATE_SECRET',
    'FEATURE_OPENCLAW_CHANNELS_TEAMS_MANAGED',
  ],
  whatsapp: [
    'FEATURE_WHATSAPP_HOSTED',
    'WHATSAPP_HOSTED_PHONE_NUMBER',
    'WHATSAPP_HOSTED_PHONE_NUMBER_ID',
    'WHATSAPP_HOSTED_ACCESS_TOKEN',
    'WHATSAPP_HOSTED_APP_SECRET',
    'WHATSAPP_HOSTED_VERIFY_TOKEN',
    'FEATURE_OPENCLAW_CHANNELS_WHATSAPP_MANAGED',
  ],
} 

function readVercelEnvList() {
  const cwd = resolve(process.env.HOSTED_CHANNEL_ENV_AUDIT_CWD || DEFAULT_AUDIT_CWD)
  if (!existsSync(cwd)) {
    throw new Error(`Hosted channel env audit cwd does not exist: ${cwd}`)
  }
  return execFileSync('vercel', ['env', 'ls'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

export function parseVercelEnvRows(output) {
  const rows = []
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('name ')) continue
    if (line.startsWith('Vercel CLI')) continue
    if (line.startsWith('Retrieving project')) continue
    if (line.startsWith('> Environment Variables found')) continue
    const parts = line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean)
    if (parts.length < 3) continue
    rows.push({
      name: parts[0],
      environments: parts[2].toLowerCase(),
    })
  }
  return rows
}

export function namesForTargetEnv(rows, targetEnv) {
  const names = new Set()
  for (const row of rows) {
    if (row.environments.includes(targetEnv)) {
      names.add(row.name)
    }
  }
  return names
}

function formatChannelResult(channel, requiredNames, presentNames) {
  const missing = requiredNames.filter((name) => !presentNames.has(name))
  return {
    channel,
    missing,
    ok: missing.length === 0,
  }
}

export function computeHostedChannelEnvAudit(rows, targetEnv) {
  const presentNames = namesForTargetEnv(rows, targetEnv)
  return Object.entries(CHANNEL_REQUIREMENTS).map(([channel, requiredNames]) =>
    formatChannelResult(channel, requiredNames, presentNames),
  )
}

function main() {
  const output = readVercelEnvList()
  const rows = parseVercelEnvRows(output)
  const results = computeHostedChannelEnvAudit(rows, TARGET_ENV)

  console.log(`Hosted channel env audit for ${TARGET_ENV}`)
  console.log('')

  for (const result of results) {
    if (result.ok) {
      console.log(`OK    ${result.channel}`)
      continue
    }
    console.log(`MISS  ${result.channel}`)
    for (const name of result.missing) {
      console.log(`  - ${name}`)
    }
  }

  const missingChannels = results.filter((result) => !result.ok)
  process.exitCode = missingChannels.length > 0 ? 1 : 0
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  try {
    main()
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.error('Vercel CLI not found. Install it or run this audit in an environment where `vercel env ls` is available.')
    } else {
      console.error(error instanceof Error ? error.message : String(error))
    }
    process.exit(1)
  }
}
