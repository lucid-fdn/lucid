import type { AppendAgentOpsFindingInput } from './workflow-types'

export function buildFindingFingerprint(input: Pick<
  AppendAgentOpsFindingInput,
  'runId' | 'severity' | 'title' | 'filePath' | 'startLine' | 'body'
>): string {
  return `agent-ops:finding:v1:${[
    input.runId,
    input.severity,
    normalizeFingerprintPart(input.title),
    normalizeFingerprintPart(input.filePath ?? ''),
    input.startLine ?? '',
    normalizeFingerprintPart(input.body).slice(0, 200),
  ].join(':')}`
}

function normalizeFingerprintPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}
