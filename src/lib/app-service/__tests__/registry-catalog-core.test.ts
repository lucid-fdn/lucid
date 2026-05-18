import { describe, expect, it } from 'vitest'
import { buildAppServiceRegistryCatalog } from '../registry-catalog-core'

describe('app service registry catalog', () => {
  it('publishes a small static catalog with forward-compatible upgrade and discovery metadata', () => {
    const catalog = buildAppServiceRegistryCatalog(new Date('2026-05-18T00:00:00.000Z'))

    expect(catalog).toMatchObject({
      schema_version: '1.0',
      source: 'static_platform_catalog',
      generated_at: '2026-05-18T00:00:00.000Z',
    })
    expect(catalog.entries).toHaveLength(5)
    expect(catalog.entries[0]).toMatchObject({
      kind: 'platform_blueprint',
      upgrade_metadata: { channel: 'stable', compatible_from: [], migration_steps: [] },
      discovery_metadata: { protocols: [], mcp: [], a2a: [] },
    })
  })
})
