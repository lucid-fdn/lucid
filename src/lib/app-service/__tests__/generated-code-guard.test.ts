import { afterEach, describe, expect, it } from 'vitest'
import { validateGeneratedCodeFiles } from '../generated-code-guard'

describe('generated code guard', () => {
  afterEach(() => {
    delete process.env.APP_SERVICE_ALLOWED_FRONTEND_HOSTS
    delete process.env.APP_SERVICE_ALLOWED_GENERATED_DEPENDENCIES
    delete process.env.APP_SERVICE_ALLOWED_GENERATED_LICENSES
    delete process.env.APP_SERVICE_MAX_GENERATED_SOURCE_BYTES
  })

  it('normalizes v0 files and allows public app runtime calls', () => {
    const result = validateGeneratedCodeFiles([
      {
        name: './app/page.tsx',
        content: [
          "const api = '/api/app-runtime/v1/public/apps/support-concierge/chat'",
          'const base = process.env.NEXT_PUBLIC_LUCID_RUNTIME_URL',
          'export default function Page() { return null }',
        ].join('\n'),
        locked: true,
      },
    ])

    expect(result.passed).toBe(true)
    expect(result.fileCount).toBe(1)
    expect(result.files[0]?.path).toBe('app/page.tsx')
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects internal APIs, private env reads, secrets, and server routes', () => {
    const result = validateGeneratedCodeFiles([
      {
        name: 'app/api/proxy/route.ts',
        content: [
          "import { createClient } from '@supabase/supabase-js'",
          "await fetch('/api/app-services/internal-control-plane')",
          'const key = process.env.V0_API_KEY',
          'const token = "sk-proj-abcdefghijklmnopqrstuvwxyz123456"',
          'export async function POST() { return Response.json({ ok: true }) }',
        ].join('\n'),
      },
      {
        name: '../.env',
        content: 'V0_API_KEY=do-not-ship',
      },
    ])

    expect(result.passed).toBe(false)
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'server_api_route',
      'internal_api_reference',
      'forbidden_server_import',
      'server_env_reference',
      'secret_token_literal',
      'unsafe_file_path',
    ]))
  })

  it('rejects split-string internal Lucid API routes and operator runtime routes', () => {
    const result = validateGeneratedCodeFiles([
      {
        name: 'app/page.tsx',
        content: [
          "const oauth = '/api/' + 'oauth/authorize'",
          "const operator = '/api/app-runtime/v1/' + 'operator/apps/app_123/settings'",
          "const billing = '/api/' + section + '/billing/portal'",
          "await fetch('/api/app-runtime/v1/operator/apps/app_123/usage')",
          "await fetch('/api/orgs/' + orgId + '/members')",
        ].join('\n'),
      },
    ])

    expect(result.passed).toBe(false)
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'internal_api_reference',
      'internal_api_fragment',
    ]))
  })

  it('rejects Agent Commerce and machine-payment route families in generated apps', () => {
    const result = validateGeneratedCodeFiles([
      {
        name: 'app/page.tsx',
        content: [
          "await fetch('/api/agent-commerce/spend-requests')",
          "await fetch('/api/internal/agent-commerce/machine/proofs/claim')",
          "await fetch('/api/webhooks/stripe/agent-commerce')",
          "const commerce = '/api/' + 'agent-commerce/providers'",
          "const webhook = '/api/' + 'webhooks/agent-commerce/manual'",
        ].join('\n'),
      },
    ])

    expect(result.passed).toBe(false)
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'internal_api_reference',
      'internal_api_fragment',
    ]))
  })

  it('rejects Commerce/provider SDK imports in generated frontend code', () => {
    const result = validateGeneratedCodeFiles([
      {
        name: 'app/page.tsx',
        content: [
          "import { getAgentCommerceProvider } from '@/lib/agent-commerce/provider-registry'",
          "import Stripe from 'stripe'",
          "import { wrapFetchWithPayment } from '@x402/fetch'",
          "const sdk = require('coinbase-commerce-node')",
        ].join('\n'),
      },
    ])

    expect(result.passed).toBe(false)
    expect(result.findings.map((finding) => finding.code)).toContain('forbidden_server_import')
  })

  it('allows split-string public App Runtime routes', () => {
    const result = validateGeneratedCodeFiles([
      {
        name: 'app/page.tsx',
        content: [
          "const chat = '/api/' + 'app-runtime/v1/public/apps/support-concierge/chat'",
          "const openapi = '/api/' + 'app-runtime/v1/sdk/openapi.json'",
        ].join('\n'),
      },
    ])

    expect(result.passed).toBe(true)
  })

  it('supports provider file maps and enforces configured size limits', () => {
    process.env.APP_SERVICE_MAX_GENERATED_SOURCE_BYTES = '10'
    const result = validateGeneratedCodeFiles({
      'app/page.tsx': {
        content: 'export default function Page() { return null }',
      },
    })

    expect(result.files[0]?.path).toBe('app/page.tsx')
    expect(result.passed).toBe(false)
    expect(result.findings.map((finding) => finding.code)).toContain('source_archive_too_large')
  })

  it('requires package.json for build validation and blocks unsupported dependencies', () => {
    const missingPackageJson = validateGeneratedCodeFiles([
      {
        name: 'app/page.tsx',
        content: 'export default function Page() { return null }',
      },
    ], { requirePackageJson: true })

    expect(missingPackageJson.passed).toBe(false)
    expect(missingPackageJson.findings.map((finding) => finding.code)).toContain('missing_package_json')

    const disallowedDependency = validateGeneratedCodeFiles([
      {
        name: 'package.json',
        content: JSON.stringify({
          scripts: { build: 'next build', postinstall: 'node steal.js' },
          dependencies: {
            next: 'latest',
            react: 'latest',
            'left-pad': 'latest',
          },
        }),
      },
    ], { requirePackageJson: true })

    expect(disallowedDependency.passed).toBe(false)
    expect(disallowedDependency.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'disallowed_dependency',
      'package_lifecycle_script',
    ]))
  })

  it('enforces generated package license allowlists', () => {
    const result = validateGeneratedCodeFiles([
      {
        name: 'package.json',
        content: JSON.stringify({
          private: true,
          license: 'GPL-3.0',
          dependencies: {
            next: { version: 'latest', license: 'MIT' },
            react: { version: 'latest', license: 'AGPL-3.0' },
          },
        }),
      },
    ], { requirePackageJson: true })

    expect(result.passed).toBe(false)
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'disallowed_license',
      'disallowed_dependency_license',
    ]))
  })
})
