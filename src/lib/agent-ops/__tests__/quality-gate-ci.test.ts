import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Agent Ops quality gate CI workflow', () => {
  it('runs the shared quality gate pack instead of duplicating Agent Ops commands in YAML', () => {
    const workflow = readFileSync(
      join(process.cwd(), '.github/workflows/agent-ops-quality-gates.yml'),
      'utf8',
    )

    expect(workflow).toContain('name: Agent Ops Quality Gates')
    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('npm ci --legacy-peer-deps')
    expect(workflow).toContain('npm run --silent agent-ops:quality-gates -- --dry-run --no-worker --format markdown >> "$GITHUB_STEP_SUMMARY"')
    expect(workflow).toContain('npm run agent-ops:quality-gates -- --no-worker')
    expect(workflow).not.toContain('npm run agent-ops:prod-preflight')
    expect(workflow).not.toContain('supabase db push')
    expect(workflow).not.toContain('supabase migration up')
  })

  it('keeps CI non-live and non-destructive by default', () => {
    const workflow = readFileSync(
      join(process.cwd(), '.github/workflows/agent-ops-quality-gates.yml'),
      'utf8',
    )

    expect(workflow).not.toContain('--live')
    expect(workflow).not.toContain('--write')
    expect(workflow).not.toContain('railway deploy')
    expect(workflow).not.toContain('vercel deploy --prod')
  })
})
