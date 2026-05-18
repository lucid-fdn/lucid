import { describe, expect, it } from 'vitest'
import {
  APP_RUNTIME_ENDPOINTS,
  APP_RUNTIME_OPENAPI,
  appRuntimeEndpointInventoryMarkdown,
  validateAppRuntimeOpenApiContract,
} from '../public-api-contract'

describe('App Runtime OpenAPI contract', () => {
  it('covers every declared runtime endpoint without structural errors', () => {
    expect(validateAppRuntimeOpenApiContract(APP_RUNTIME_OPENAPI)).toEqual([])

    const paths = APP_RUNTIME_OPENAPI.paths as Record<string, Record<string, { operationId?: string }>>
    for (const endpoint of APP_RUNTIME_ENDPOINTS) {
      expect(paths[endpoint.path]?.[endpoint.method]?.operationId).toBe(endpoint.operationId)
    }
  })

  it('keeps operation ids unique and exposes the production abuse schema', () => {
    const operations = Object.values(APP_RUNTIME_OPENAPI.paths)
      .flatMap((pathItem) => Object.values(pathItem))
      .map((operation) => operation.operationId)

    expect(new Set(operations).size).toBe(operations.length)
    expect(APP_RUNTIME_OPENAPI.components.schemas.OperatorAbuseSummary).toMatchObject({
      required: expect.arrayContaining([
        'status',
        'denied_origins_24h',
        'rate_limited_24h',
        'cost_cap_hits_24h',
        'unsafe_feedback_24h',
        'recommended_actions',
      ]),
    })
    expect(APP_RUNTIME_OPENAPI.components.schemas.PublicAppConfig).toMatchObject({
      required: expect.arrayContaining(['commerce']),
      properties: {
        commerce: { $ref: '#/components/schemas/PublicAppCommerce' },
      },
    })
    expect(APP_RUNTIME_OPENAPI.components.schemas.PublicActionCommerceConfig).toMatchObject({
      properties: {
        mode: { enum: ['off', 'shadow', 'enforce'] },
        amount: { $ref: '#/components/schemas/PublicActionCommerceAmount' },
      },
    })
  })

  it('generates endpoint inventory documentation from the same source of truth', () => {
    const markdown = appRuntimeEndpointInventoryMarkdown()

    expect(markdown).toContain('| GET | `/public/apps/{slug}/config` | `getPublicAppConfig` | public |')
    expect(markdown).toContain('| GET | `/operator/apps/{appId}/usage` | `getOperatorUsage` | operator |')
    expect(markdown).toContain('| GET | `/sdk/openapi.json` | `getAppRuntimeOpenApi` | sdk |')
  })
})
