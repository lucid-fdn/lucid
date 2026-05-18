import type { GeneratedCodeFile } from './generated-code-guard'
import type { SandboxValidationRequest } from './sandbox-providers/types'

const DEFAULT_SANDBOX_BUILD_EGRESS_HOSTS = [
  'registry.npmjs.org',
  '*.npmjs.org',
  '*.npmjs.com',
]

function getSandboxBuildNetworkPolicy(): unknown {
  const configured = process.env.APP_SERVICE_SANDBOX_BUILD_NETWORK_POLICY
  if (!configured) {
    return { allow: DEFAULT_SANDBOX_BUILD_EGRESS_HOSTS }
  }

  const trimmed = configured.trim()
  if (trimmed === 'allow-all' || trimmed === 'deny-all') return trimmed

  return {
    allow: trimmed
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean),
  }
}

export function buildGeneratedCodeSandboxRequest(files: GeneratedCodeFile[]): SandboxValidationRequest {
  const auditLevel = process.env.APP_SERVICE_DEPENDENCY_AUDIT_LEVEL || 'high'
  return {
    files: files.map((file) => ({
      path: file.path,
      content: file.content,
    })),
    commands: [
      {
        cmd: 'npm',
        args: ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
      },
      {
        cmd: 'npm',
        args: ['run', 'build', '--if-present'],
      },
      {
        cmd: 'npm',
        args: ['audit', '--omit=dev', `--audit-level=${auditLevel}`],
      },
    ],
    env: {
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_LUCID_RUNTIME_URL: process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '',
    },
    networkPolicy: getSandboxBuildNetworkPolicy(),
  }
}
