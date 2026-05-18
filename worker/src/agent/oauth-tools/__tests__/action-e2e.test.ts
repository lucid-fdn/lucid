/**
 * Live E2E — Nango-backed integration smoke tests
 *
 * This suite intentionally uses the same worker-side primitives that production
 * uses today:
 * - action scripts from `nango-integrations/build`
 * - `createNangoProxyAdapter()` from the worker OAuth layer
 *
 * It does not hardcode provider-specific connections. Instead, callers supply
 * live fixtures through env so the same harness can cover every Nango-backed
 * integration that has a real connection in the target environment.
 *
 * Environment:
 * - NANGO_SECRET_KEY
 * - NANGO_HOST
 * - NANGO_E2E_FIXTURES or NANGO_E2E_FIXTURES_FILE
 *
 * Optional:
 * - NANGO_E2E_REQUIRE_ALL=true
 *   Enforce that every built integration has a live fixture.
 */

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createNangoProxyAdapter } from '../nango-proxy-adapter.js'

const SCRIPTS_DIR = resolve(import.meta.dirname, '../../../../../nango-integrations/build')
const require = createRequire(import.meta.url)

const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY?.trim()
const NANGO_HOST = process.env.NANGO_HOST?.trim()
const FIXTURES_INLINE = process.env.NANGO_E2E_FIXTURES?.trim()
const FIXTURES_FILE = process.env.NANGO_E2E_FIXTURES_FILE?.trim()
const REQUIRE_ALL = process.env.NANGO_E2E_REQUIRE_ALL === 'true'

interface LiveFixture {
  connectionId: string
  providerConfigKey?: string
  smokeAction: string
  smokeArgs?: Record<string, unknown>
  expectKeys?: string[]
}

type FixtureMap = Record<string, LiveFixture>

function loadFixtures(): FixtureMap {
  const raw = FIXTURES_INLINE
    ? FIXTURES_INLINE
    : FIXTURES_FILE && existsSync(FIXTURES_FILE)
      ? readFileSync(FIXTURES_FILE, 'utf8')
      : ''

  if (!raw) return {}

  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('NANGO_E2E_FIXTURES must decode to an object keyed by integration id')
  }

  const fixtures = parsed as FixtureMap
  for (const [integrationId, fixture] of Object.entries(fixtures)) {
    if (!fixture?.connectionId) {
      throw new Error(`Missing connectionId for fixture "${integrationId}"`)
    }
    if (!fixture?.smokeAction) {
      throw new Error(`Missing smokeAction for fixture "${integrationId}"`)
    }
  }

  return fixtures
}

function getBuiltIntegrationIds(): string[] {
  if (!existsSync(SCRIPTS_DIR)) return []

  const providers = new Set<string>()
  for (const file of readdirSync(SCRIPTS_DIR)) {
    const match = file.match(/^(.+)_actions_(.+)\.cjs$/)
    if (match) providers.add(match[1])
  }
  return [...providers].sort()
}

function loadScript(integrationId: string, actionName: string) {
  const path = resolve(SCRIPTS_DIR, `${integrationId}_actions_${actionName}.cjs`)
  if (!existsSync(path)) return null
  const mod = require(path)
  return mod.default || mod
}

const fixtures = loadFixtures()
const fixtureEntries = Object.entries(fixtures)
const builtIntegrationIds = getBuiltIntegrationIds()

const nangoReachable = NANGO_HOST
  ? await fetch(`${NANGO_HOST}/health`, { signal: AbortSignal.timeout(5000) })
    .then(r => r.ok || r.status < 500)
    .catch(() => false)
  : false

const canRun = !!NANGO_SECRET_KEY && !!NANGO_HOST && existsSync(SCRIPTS_DIR) && nangoReachable

describe.skipIf(!canRun)('E2E — Live Nango integration smoke', () => {
  it('has at least one live fixture', () => {
    expect(fixtureEntries.length).toBeGreaterThan(0)
  })

  it('all declared fixtures point to built integrations', () => {
    const unknown = fixtureEntries
      .map(([integrationId]) => integrationId)
      .filter((integrationId) => !builtIntegrationIds.includes(integrationId))

    expect(unknown).toEqual([])
  })

  it('can enforce all-integration live coverage when requested', () => {
    if (!REQUIRE_ALL) {
      expect(true).toBe(true)
      return
    }

    const missing = builtIntegrationIds.filter((integrationId) => !(integrationId in fixtures))
    expect(missing).toEqual([])
  })

  for (const [integrationId, fixture] of fixtureEntries) {
    const providerConfigKey = fixture.providerConfigKey || integrationId

    describe(`${integrationId} live fixture`, () => {
      it('can resolve the configured connection', async () => {
        const adapter = createNangoProxyAdapter(fixture.connectionId, providerConfigKey)
        const conn = await adapter.getConnection() as Record<string, unknown>

        expect(conn).toBeTruthy()

        const actualKey =
          (conn.provider_config_key as string | undefined)
          || (conn.providerConfigKey as string | undefined)
          || (conn.connection_config?.providerConfigKey as string | undefined)

        if (actualKey) {
          expect(actualKey).toBe(providerConfigKey)
        }
      }, 15000)

      it(`executes smoke action ${fixture.smokeAction}`, async () => {
        const script = loadScript(integrationId, fixture.smokeAction)
        expect(script, `Missing script for ${integrationId}/${fixture.smokeAction}`).not.toBeNull()

        const adapter = createNangoProxyAdapter(fixture.connectionId, providerConfigKey)
        const result = await script.exec(adapter, fixture.smokeArgs ?? {}) as Record<string, unknown>

        expect(result).toBeTruthy()
        expect(() => JSON.stringify(result)).not.toThrow()

        for (const key of fixture.expectKeys ?? []) {
          expect(result).toHaveProperty(key)
        }
      }, 30000)
    })
  }
})

describe.skipIf(canRun)('E2E — Live Nango integration smoke (skipped)', () => {
  it('documents required env', () => {
    expect({
      hasSecret: !!NANGO_SECRET_KEY,
      hasHost: !!NANGO_HOST,
      hasScriptsDir: existsSync(SCRIPTS_DIR),
      hasFixtures: fixtureEntries.length > 0,
      nangoReachable,
    }).toBeTruthy()
  })
})
