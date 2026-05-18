#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { Client } from 'pg'

const execFileAsync = promisify(execFile)
loadLocalEnv()

const args = parseArgs(process.argv.slice(2))
const migrationPath = args.file
if (!migrationPath) {
  console.error('Usage: node scripts/apply-supabase-migration.mjs --file supabase/migrations/<migration>.sql [--name migration_name] [--check-column table.column]')
  process.exit(1)
}

const sql = readFileSync(path.resolve(migrationPath), 'utf8')
const name = args.name ?? path.basename(migrationPath).replace(/\.sql$/, '')

if (args['check-column']) {
  const [table, column] = String(args['check-column']).split('.')
  if (!table || !column) {
    console.error('--check-column must be in table.column format')
    process.exit(1)
  }
  const visible = await checkColumn({ table, column })
  if (visible) {
    console.log(`migration_status=already_applied column=${table}.${column}`)
    process.exit(0)
  }
}

const postgresConnectionString = getPostgresConnectionString()
if (postgresConnectionString) {
  await applyViaPostgres(sql, postgresConnectionString)
  process.exit(0)
}

const accessToken = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT
const projectRef = getSupabaseProjectRef()

if (accessToken && projectRef) {
  await applyViaManagementApi({ projectRef, accessToken, name, sql })
  process.exit(0)
}

if (await canUseLinkedSupabaseCli()) {
  await applyViaLinkedSupabaseCli(migrationPath)
  process.exit(0)
}

console.error('migration_status=blocked_missing_credentials')
console.error('Provide one of:')
console.error('- DATABASE_URL / SUPABASE_DB_URL / RAILWAY_DATABASE_URL for direct Postgres migration')
console.error('- SUPABASE_DB_PASSWORD with supabase/.temp/pooler-url for linked Supabase pooler migration')
console.error('- SUPABASE_ACCESS_TOKEN plus SUPABASE_PROJECT_REF or SUPABASE_URL for Supabase Management API migration')
console.error('- An authenticated Supabase CLI linked to the project, using `npx supabase db query --linked`')
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Detected SUPABASE_SERVICE_ROLE_KEY, but service-role keys cannot run DDL migrations.')
}
process.exit(2)

async function applyViaPostgres(sqlText, connectionString) {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  let connected = false
  try {
    await client.connect()
    connected = true
    await client.query('begin')
    await client.query(sqlText)
    await client.query('commit')
    console.log('migration_status=applied method=postgres')
  } catch (error) {
    if (connected) await client.query('rollback').catch(() => {})
    console.error(`migration_status=failed method=postgres message=${error.message}`)
    process.exit(1)
  } finally {
    if (connected) await client.end()
  }
}

async function applyViaManagementApi(input) {
  const endpoint = `https://api.supabase.com/v1/projects/${input.projectRef}/database/migrations`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ name: input.name, query: input.sql }),
  })
  const text = await response.text()
  if (!response.ok) {
    console.error(`migration_status=failed method=management_api status=${response.status} body=${safeBody(text)}`)
    process.exit(1)
  }
  console.log('migration_status=applied method=management_api')
}

async function canUseLinkedSupabaseCli() {
  if (!readOptionalFile('supabase/.temp/project-ref')) return false
  try {
    await execFileAsync('npx', ['--yes', 'supabase', 'projects', 'list'], {
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    })
    return true
  } catch {
    return false
  }
}

async function applyViaLinkedSupabaseCli(filePath) {
  try {
    const { stdout, stderr } = await execFileAsync(
      'npx',
      ['--yes', 'supabase', 'db', 'query', '--linked', '--file', filePath],
      { maxBuffer: 1024 * 1024, timeout: 60_000 },
    )
    const output = `${stdout}\n${stderr}`.trim()
    if (output) console.log(safeBody(output))
    console.log('migration_status=applied method=supabase_cli_linked')
  } catch (error) {
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim()
    console.error(`migration_status=failed method=supabase_cli_linked message=${error.message}`)
    if (output) console.error(safeBody(output))
    process.exit(1)
  }
}

async function checkColumn(input) {
  const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !serviceKey) return false
  const url = `${baseUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(input.table)}?select=${encodeURIComponent(input.column)}&limit=1`
  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
  })
  return response.ok
}

function projectRefFromUrl(value) {
  if (!value) return null
  const match = value.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)
  return match?.[1] ?? null
}

function getSupabaseProjectRef() {
  return process.env.SUPABASE_PROJECT_REF
    || projectRefFromUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
    || readOptionalFile('supabase/.temp/project-ref')?.trim()
    || null
}

function getPostgresConnectionString() {
  const explicit = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.RAILWAY_DATABASE_URL
  if (explicit) return explicit

  const password = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD
  const poolerUrl = readOptionalFile('supabase/.temp/pooler-url')?.trim()
  if (!password || !poolerUrl) return null

  const url = new URL(poolerUrl)
  url.password = password
  return url.toString()
}

function readOptionalFile(filePath) {
  const absolute = path.resolve(filePath)
  if (!existsSync(absolute)) return null
  return readFileSync(absolute, 'utf8')
}

function loadLocalEnv() {
  for (const file of ['.env.local', '.env']) {
    const absolute = path.resolve(file)
    if (!existsSync(absolute)) continue
    const text = readFileSync(absolute, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!match || process.env[match[1]]) continue
      process.env[match[1]] = unquoteEnvValue(match[2])
    }
  }
}

function unquoteEnvValue(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseArgs(argv) {
  const parsed = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      parsed[key] = true
    } else {
      parsed[key] = next
      i += 1
    }
  }
  return parsed
}

function safeBody(value) {
  return value.replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, '$1[REDACTED]').slice(0, 500)
}
