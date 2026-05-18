import { describe, expect, it } from 'vitest'

import { inspectEnvSecrets } from '../../scripts/audit/env-secret-inventory'
import { inspectMigration } from '../../scripts/audit/rls-migration-inventory'
import { inspectRoute } from '../../scripts/audit/route-auth-inventory'
import { inspectPage } from '../../scripts/audit/ui-page-inventory'

describe('whole-codebase audit scanners', () => {
  it('flags mutating API routes with no obvious auth guard', async () => {
    const item = inspectRoute('src/app/api/danger/route.ts', `
      import { NextResponse } from 'next/server'
      export async function POST(request: Request) {
        const body = await request.json()
        return NextResponse.json({ ok: true, body })
      }
    `)

    expect(item.mutates).toBe(true)
    expect(item.classification).toBe('unknown')
    expect(item.hasSessionAuth).toBe(false)
    expect(item.hasInternalSecret).toBe(false)
  })

  it('recognizes internal bearer routes as internal', () => {
    const item = inspectRoute('src/app/api/internal/rebuild/route.ts', `
      import { timingSafeEqual } from 'crypto'
      export async function POST(request: Request) {
        const secret = process.env.INTERNAL_SERVICE_SECRET
        const authorization = request.headers.get('authorization')
        timingSafeEqual(Buffer.from(secret || ''), Buffer.from(authorization || ''))
        return Response.json({ ok: true })
      }
    `)

    expect(item.classification).toBe('internal')
    expect(item.hasInternalSecret).toBe(true)
  })

  it('detects sensitive public env names and redacts literal provider secrets', () => {
    const items = inspectEnvSecrets('src/app/live-provider.ts', `
      const token = process.env.NEXT_PUBLIC_INTERNAL_SERVICE_TOKEN
      const browserbase = 'bb_live_Q1w2E3r4T5y6U7i8O9p0L1m2'
    `)

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'public_sensitive_env',
        name: 'NEXT_PUBLIC_INTERNAL_SERVICE_TOKEN',
        risk: 'high',
      }),
      expect.objectContaining({
        kind: 'literal_secret_pattern',
        name: 'browserbase_live_key',
        risk: 'critical',
      }),
    ]))
    expect(items.find((item) => item.kind === 'literal_secret_pattern')?.snippet).toContain('...')
  })

  it('detects security definer migrations without search_path', () => {
    const item = inspectMigration('supabase/migrations/20260515000000_test.sql', `
      create or replace function public.do_admin()
      returns void
      language plpgsql
      security definer
      as $$ begin null; end; $$;
    `)

    expect(item.securityDefinerFunctions).toEqual(['public.do_admin'])
    expect(item.hasSearchPath).toBe(false)
    expect(item.riskNotes).toContain('security_definer_without_search_path')
  })

  it('classifies product pages and detects mock markers', () => {
    const item = inspectPage('src/app/(app)/[workspace-slug]/templates/page.tsx', `
      export default function Page() {
        const mockTemplates = []
        return <button>Install</button>
      }
    `)

    expect(item.classification).toBe('template')
    expect(item.hasMockMarkers).toBe(true)
    expect(item.actionMarkers).toContain('Install')
  })
})
