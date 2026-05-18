/**
 * selfhost:doctor — Diagnostic script for self-hosted Lucid
 *
 * Usage: npx tsx scripts/selfhost-doctor.ts
 * Or:    npm run selfhost:doctor
 *
 * Checks all required services, env vars, and configuration.
 */

interface CheckResult {
  name: string
  status: 'pass' | 'fail' | 'warn'
  message: string
  fix?: string
}

const results: CheckResult[] = []

function pass(name: string, message: string) {
  results.push({ name, status: 'pass', message })
}

function fail(name: string, message: string, fix?: string) {
  results.push({ name, status: 'fail', message, fix })
}

function warn(name: string, message: string, fix?: string) {
  results.push({ name, status: 'warn', message, fix })
}

// ─── Check: Required env vars ──────────────────────────────

function checkEnvVars() {
  const required = [
    'POSTGRES_PASSWORD',
    'JWT_SECRET',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ENCRYPTION_KEY',
    'MESSAGE_ENCRYPTION_MASTER_KEY',
  ]

  for (const key of required) {
    if (process.env[key]) {
      pass(`env:${key}`, 'Set')
    } else {
      fail(`env:${key}`, 'Missing', 'Run ./scripts/generate-env.sh to generate')
    }
  }

  // Check encryption key lengths
  const encKey = process.env.ENCRYPTION_KEY || ''
  if (encKey && encKey.length !== 64) {
    fail('env:ENCRYPTION_KEY:length', `Expected 64 hex chars, got ${encKey.length}`, 'Regenerate with: openssl rand -hex 32')
  } else if (encKey) {
    pass('env:ENCRYPTION_KEY:length', '64 hex chars')
  }

  const masterKey = process.env.MESSAGE_ENCRYPTION_MASTER_KEY || ''
  if (masterKey && masterKey.length !== 64) {
    fail('env:MESSAGE_ENCRYPTION_MASTER_KEY:length', `Expected 64 hex chars, got ${masterKey.length}`, 'Regenerate with: openssl rand -hex 32')
  } else if (masterKey) {
    pass('env:MESSAGE_ENCRYPTION_MASTER_KEY:length', '64 hex chars')
  }
}

// ─── Check: Auth provider ──────────────────────────────────

function checkAuthProvider() {
  const provider = process.env.AUTH_PROVIDER || 'local'

  if (provider === 'local') {
    pass('auth:provider', 'Local (GoTrue)')
  } else if (provider === 'privy') {
    if (process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.PRIVY_APP_SECRET) {
      pass('auth:provider', 'Privy (configured)')
    } else {
      fail('auth:provider', 'Privy selected but credentials missing', 'Set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET')
    }
  } else {
    warn('auth:provider', `Unknown provider: ${provider}`, 'Use "local" or "privy"')
  }
}

// ─── Check: LLM configured ────────────────────────────────

function checkLLM() {
  const openaiKey = process.env.OPENAI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const groqKey = process.env.GROQ_API_KEY
  const fallbackUrl = process.env.FALLBACK_PROVIDER_URL
  const trustgateKey = process.env.TRUSTGATE_API_KEY

  const isSet = (v: string | undefined) => v && v !== '' && v !== 'your-key-here'

  if (isSet(trustgateKey)) {
    pass('llm:provider', 'Lucid Gateway configured (100+ models)')
  } else if (isSet(openaiKey)) {
    pass('llm:provider', 'OpenAI API key configured')
  } else if (isSet(anthropicKey)) {
    pass('llm:provider', 'Anthropic API key configured')
  } else if (isSet(groqKey)) {
    pass('llm:provider', 'Groq API key configured')
  } else if (fallbackUrl) {
    pass('llm:provider', `OpenAI-compatible endpoint: ${fallbackUrl}`)
  } else {
    fail('llm:provider', 'No LLM provider configured', 'Set TRUSTGATE_API_KEY (easiest — lucid.foundation), or OPENAI_API_KEY / ANTHROPIC_API_KEY / GROQ_API_KEY, or FALLBACK_PROVIDER_URL in .env')
  }
}

// ─── Check: Database ───────────────────────────────────────

async function checkDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    fail('db:connection', 'Supabase URL or service role key not set')
    return
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(url, key)
    const { error } = await client.from('profiles').select('id').limit(1)
    if (error) {
      fail('db:connection', `Query failed: ${error.message}`, 'Check if PostgREST is running and migrations are applied')
    } else {
      pass('db:connection', 'PostgreSQL + PostgREST reachable')
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('MODULE_NOT_FOUND') || msg.includes('Cannot find')) {
      fail('db:connection', 'supabase-js not installed', 'Run npm install first')
    } else {
      fail('db:connection', `Connection failed: ${msg}`, 'Ensure db and postgrest services are running')
    }
  }
}

// ─── Check: GoTrue ─────────────────────────────────────────

async function checkGoTrue() {
  const gotrueUrl = process.env.GOTRUE_URL || 'http://gotrue:9999'

  try {
    const res = await fetch(`${gotrueUrl}/health`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      pass('gotrue:health', `GoTrue reachable at ${gotrueUrl}`)
      return
    }
  } catch {
    // /health may not exist, try /settings
  }

  try {
    const res = await fetch(`${gotrueUrl}/settings`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      pass('gotrue:health', `GoTrue reachable at ${gotrueUrl}`)
    } else {
      fail('gotrue:health', `GoTrue returned ${res.status}`, 'Check gotrue service in docker compose')
    }
  } catch {
    fail('gotrue:health', `GoTrue not reachable at ${gotrueUrl}`, 'Ensure gotrue service is running')
  }
}

// ─── Check: Redis ──────────────────────────────────────────

async function checkRedis() {
  const redisUrl = process.env.REDIS_URL

  if (!redisUrl) {
    warn('redis:connection', 'REDIS_URL not set (optional)', 'Set REDIS_URL for caching and rate limiting')
    return
  }

  try {
    const redis = await import('redis')
    const client = redis.createClient({ url: redisUrl })
    await client.connect()
    await client.ping()
    await client.disconnect()
    pass('redis:connection', 'Redis reachable')
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('MODULE_NOT_FOUND') || msg.includes('Cannot find')) {
      fail('redis:connection', 'redis package not installed', 'Run npm install first')
    } else {
      fail('redis:connection', `Redis not reachable: ${msg}`, 'Ensure redis service is running')
    }
  }
}

// ─── Check: Worker ─────────────────────────────────────────

async function checkWorker() {
  const workerUrl = process.env.WORKER_URL || 'http://worker:8080'

  try {
    const res = await fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      pass('worker:health', `Worker reachable at ${workerUrl}`)
    } else {
      fail('worker:health', `Worker returned ${res.status}`, 'Check worker service in docker compose')
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    fail('worker:health', `Worker not reachable: ${msg}`, 'Ensure worker service is running')
  }
}

// ─── Check: Deployment mode ────────────────────────────────

function checkDeploymentMode() {
  const mode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE

  if (mode === 'self-hosted') {
    pass('config:deployment_mode', 'self-hosted')
  } else if (!mode) {
    warn('config:deployment_mode', 'Not set (defaults to "saas")', 'Set NEXT_PUBLIC_DEPLOYMENT_MODE=self-hosted')
  } else {
    pass('config:deployment_mode', mode)
  }

  if (process.env.FEATURE_AGENT_RUNTIME === 'true') {
    pass('config:agent_runtime', 'Enabled')
  } else {
    warn('config:agent_runtime', 'Not enabled', 'Set FEATURE_AGENT_RUNTIME=true for agent functionality')
  }
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('')
  console.log('Lucid Self-Host Doctor')
  console.log('='.repeat(50))
  console.log('')

  // Sync checks
  checkEnvVars()
  checkAuthProvider()
  checkLLM()
  checkDeploymentMode()

  // Async checks (run in parallel)
  const asyncResults = await Promise.allSettled([
    checkDatabase(),
    checkGoTrue(),
    checkRedis(),
    checkWorker(),
  ])

  for (const result of asyncResults) {
    if (result.status === 'rejected') {
      fail('internal', `Check crashed: ${result.reason}`)
    }
  }

  // Print results
  console.log('')
  const maxName = Math.max(...results.map((r) => r.name.length))

  for (const r of results) {
    const icon = r.status === 'pass' ? 'OK' : r.status === 'fail' ? 'FAIL' : 'WARN'
    const pad = ' '.repeat(maxName - r.name.length)
    console.log(`  [${icon.padEnd(4)}] ${r.name}${pad}  ${r.message}`)
    if (r.fix) {
      console.log(`         ${''.repeat(maxName)}  Fix: ${r.fix}`)
    }
  }

  // Summary
  const passed = results.filter((r) => r.status === 'pass').length
  const failed = results.filter((r) => r.status === 'fail').length
  const warned = results.filter((r) => r.status === 'warn').length

  console.log('')
  console.log('-'.repeat(50))
  console.log(`  ${passed} passed, ${warned} warnings, ${failed} failed`)
  console.log('')

  if (failed > 0) {
    console.log('Some checks failed. Fix the issues above and re-run.')
    process.exit(1)
  } else if (warned > 0) {
    console.log('All critical checks passed, but some optional features are not configured.')
  } else {
    console.log('All checks passed! Your Lucid instance is healthy.')
  }
}

main().catch((err) => {
  console.error('Doctor script failed:', err)
  process.exit(1)
})
