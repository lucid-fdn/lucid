import { afterEach, describe, expect, it } from 'vitest'
import { buildGeneratedCodeSandboxRequest } from '../generated-build-validation'

describe('generated build validation', () => {
  afterEach(() => {
    delete process.env.APP_SERVICE_SANDBOX_BUILD_NETWORK_POLICY
    delete process.env.APP_SERVICE_DEPENDENCY_AUDIT_LEVEL
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  it('creates a constrained sandbox build request for generated files', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://lucid.example'
    const request = buildGeneratedCodeSandboxRequest([
      { path: 'package.json', content: '{"scripts":{"build":"next build"}}' },
      { path: 'app/page.tsx', content: 'export default function Page() { return null }' },
    ])

    expect(request.files).toHaveLength(2)
    expect(request.commands).toEqual([
      { cmd: 'npm', args: ['install', '--ignore-scripts', '--no-audit', '--no-fund'] },
      { cmd: 'npm', args: ['run', 'build', '--if-present'] },
      { cmd: 'npm', args: ['audit', '--omit=dev', '--audit-level=high'] },
    ])
    expect(request.env).toMatchObject({
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_LUCID_RUNTIME_URL: 'https://lucid.example',
    })
    expect(request.networkPolicy).toEqual({
      allow: ['registry.npmjs.org', '*.npmjs.org', '*.npmjs.com'],
    })
  })

  it('supports an environment-provided sandbox build egress allowlist', () => {
    process.env.APP_SERVICE_SANDBOX_BUILD_NETWORK_POLICY = 'registry.npmjs.org,cdn.example.com'

    expect(buildGeneratedCodeSandboxRequest([]).networkPolicy).toEqual({
      allow: ['registry.npmjs.org', 'cdn.example.com'],
    })
  })
})
