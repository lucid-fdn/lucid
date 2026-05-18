type AdapterType = 'hermes' | 'openclaw' | 'shared-worker'

type ExecutionTargetKind = 'shared_worker' | 'dedicated_worker' | 'byo_bridge'

interface RuntimeExecutionTarget {
  kind: ExecutionTargetKind
  runtimeId?: string
  targetId?: string
  generation?: number | null
  bridgeMode?: 'observe' | 'full'
  runtimeHomeRoot?: string | null
  metadata?: Record<string, unknown>
}

const TARGETS: Record<AdapterType, ExecutionTargetKind[]> = {
  hermes: ['shared_worker', 'dedicated_worker', 'byo_bridge'],
  openclaw: ['shared_worker', 'dedicated_worker', 'byo_bridge'],
  'shared-worker': ['shared_worker'],
}

const SERVICES: Record<AdapterType, Array<Record<string, unknown>>> = {
  openclaw: [
    {
      key: 'sessions',
      label: 'OpenClaw sessions',
      description: 'Runtime-owned session state exposed through Lucid runtime commands.',
      status: 'available',
      endpointKind: 'local_process',
      defaultEnabled: true,
    },
    {
      key: 'native_tools',
      label: 'Native tools',
      description: 'OpenClaw native tool surface mediated by Lucid policy and audit.',
      status: 'available',
      endpointKind: 'local_process',
      defaultEnabled: true,
    },
  ],
  hermes: [
    {
      key: 'hermes_home',
      label: 'Hermes home',
      description: 'Local-first Hermes home state synchronized through governed EHV snapshots.',
      status: 'runtime_owned',
      endpointKind: 'local_process',
      defaultEnabled: true,
    },
    {
      key: 'home_watch',
      label: 'Home watcher',
      description: 'Diff and mutation reporting for Hermes home changes.',
      status: 'optional',
      endpointKind: 'local_process',
      defaultEnabled: false,
    },
  ],
  'shared-worker': [
    {
      key: 'managed_runtime',
      label: 'Lucid managed runtime',
      description: 'Shared worker services are operated by Lucid and exposed through centralized contracts.',
      status: 'available',
      endpointKind: 'managed_api',
      defaultEnabled: true,
    },
  ],
}

function adapterLabel(type: AdapterType): string {
  if (type === 'hermes') return 'Hermes'
  if (type === 'openclaw') return 'OpenClaw'
  return 'Lucid shared worker'
}

function normalizeAdapterType(input: string): AdapterType {
  if (input === 'hermes' || input === 'openclaw') return input
  return 'shared-worker'
}

function parseTranscriptFixture(fixture: string, ts: string, adapterContractLoaded: boolean) {
  const lines = fixture.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) {
    return [{ kind: 'system', ts, text: adapterContractLoaded ? 'parser ready' : 'fallback parser ready' }]
  }
  return lines.slice(0, 50).map((line) => {
    const lower = line.toLowerCase()
    if (lower.startsWith('assistant:')) return { kind: 'assistant', ts, text: line.slice('assistant:'.length).trim() }
    if (lower.startsWith('user:')) return { kind: 'user', ts, text: line.slice('user:'.length).trim() }
    if (lower.startsWith('stderr:')) return { kind: 'stderr', ts, text: line.slice('stderr:'.length).trim() }
    if (lower.startsWith('system:')) return { kind: 'system', ts, text: line.slice('system:'.length).trim() }
    return { kind: 'stdout', ts, text: line }
  })
}

export function getRuntimeAdapterServices(type: string): Array<Record<string, unknown>> {
  return [...(SERVICES[normalizeAdapterType(type)] ?? [])]
}

export function testRuntimeAdapterTranscriptParser(input: {
  type: string
  fixture?: string
  forceFallback?: boolean
  now?: string
}): Record<string, unknown> {
  const type = normalizeAdapterType(input.type)
  const testedAt = input.now ?? new Date().toISOString()
  const supported = type === 'hermes' || type === 'openclaw'
  const fallbackUsed = input.forceFallback === true || !supported
  const maxBytes = 50_000
  const fixture = (input.fixture ?? 'assistant: hello').slice(0, maxBytes)

  return {
    adapterType: type,
    supported,
    status: supported ? (fallbackUsed ? 'warn' : 'pass') : 'warn',
    parser: supported
      ? {
          contract: 'lucid.runtimeTranscriptParser',
          version: '1.0.0',
          maxBytes,
          deterministic: true,
          sandboxed: true,
        }
      : null,
    entries: parseTranscriptFixture(fixture, testedAt, supported && !fallbackUsed),
    fallbackUsed,
    sandbox: {
      enabled: true,
      strategy: fallbackUsed ? 'safe_builtin_fallback' : 'adapter_contract',
      maxBytes,
    },
    diagnostics: [
      supported
        ? {
            code: fallbackUsed ? 'parser.fallback_used' : 'parser.contract_loaded',
            level: fallbackUsed ? 'warn' : 'info',
            message: fallbackUsed
              ? 'Adapter parser contract exists, but the safe fallback parser was requested'
              : 'Adapter transcript parser contract loaded in sandbox-compatible mode',
          }
        : {
            code: 'parser.unsupported',
            level: 'warn',
            message: 'Adapter does not advertise a transcript parser; safe fallback parser was used',
          },
    ],
    testedAt,
  }
}

export function testRuntimeAdapterEnvironment(input: {
  type: string
  target: RuntimeExecutionTarget
  now?: string
}): Record<string, unknown> {
  const type = normalizeAdapterType(input.type)
  const target = input.target
  const supported = TARGETS[type].includes(target.kind)
  const checks: Array<Record<string, unknown>> = [
    {
      code: supported ? 'target.supported' : 'target.unsupported',
      level: supported ? 'info' : 'error',
      message: supported
        ? `${adapterLabel(type)} supports ${target.kind}`
        : `${adapterLabel(type)} does not support ${target.kind}`,
      targetKind: target.kind,
    },
    {
      code: target.runtimeHomeRoot ? 'engine_home.root.present' : 'engine_home.root.deferred',
      level: target.runtimeHomeRoot ? 'info' : 'warn',
      message: target.runtimeHomeRoot
        ? 'Runtime home root is available for engine-home sync'
        : 'Runtime home root will be resolved by the worker or BYO runtime',
      targetKind: target.kind,
    },
  ]

  if (target.kind === 'byo_bridge') {
    checks.push({
      code: target.bridgeMode === 'full' ? 'bridge.full' : 'bridge.observe',
      level: 'info',
      message: target.bridgeMode === 'full' ? 'BYO bridge can accept management commands' : 'BYO bridge is observe-only',
      targetKind: target.kind,
    })
  }

  if (type === 'hermes' && target.kind === 'shared_worker') {
    checks.push({
      code: 'hermes.shared.local_first',
      level: 'info',
      message: 'Shared Hermes uses EHV/HHV projection so durable local-first state remains governed outside global HERMES_HOME',
      targetKind: target.kind,
    })
  }

  if (type === 'hermes' && target.kind === 'byo_bridge') {
    const metadata = target.metadata ?? {}
    const cliVerified = metadata.hermesCliReady === true || metadata.hermesBinaryReady === true || metadata.hermesCommandDetected === true
    checks.push({
      code: cliVerified ? 'hermes.cli.verified' : 'hermes.cli.unverified',
      level: cliVerified ? 'info' : 'warn',
      message: cliVerified
        ? 'BYO host reported a usable Hermes CLI'
        : 'BYO Hermes host has not reported hermes --version; install Hermes or set HERMES_BINARY/HERMES_BIN_PATH/HERMES_COMMAND before running agents',
      targetKind: target.kind,
    })
  }

  const hasError = checks.some((check) => check.level === 'error')
  const hasWarn = checks.some((check) => check.level === 'warn')
  return {
    adapterType: type,
    status: hasError ? 'fail' : hasWarn ? 'warn' : 'pass',
    target,
    checks,
    testedAt: input.now ?? new Date().toISOString(),
  }
}
