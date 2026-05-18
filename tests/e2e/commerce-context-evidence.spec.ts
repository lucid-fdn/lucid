import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { createHash, randomUUID } from 'node:crypto'

import { createTeam, getCsrfToken, getSupabaseAdminContext, getWorkspaceContext } from './helpers'

type SupabaseAdminContext = NonNullable<ReturnType<typeof getSupabaseAdminContext>>

async function supabaseFetch(
  request: APIRequestContext,
  admin: SupabaseAdminContext,
  path: string,
  init: Parameters<APIRequestContext['fetch']>[1] = {},
) {
  return request.fetch(`${admin.baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: admin.serviceRoleKey,
      Authorization: `Bearer ${admin.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    failOnStatusCode: false,
    timeout: 120_000,
  })
}

async function insertSupabaseRow(
  page: Page,
  admin: SupabaseAdminContext,
  table: string,
  data: Record<string, unknown>,
) {
  const response = await supabaseFetch(page.request, admin, table, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    data,
  })
  expect(response.ok(), `${table} insert failed: ${await response.text()}`).toBe(true)
}

async function deleteSupabaseRows(
  page: Page,
  admin: SupabaseAdminContext,
  table: string,
  ids: string[],
) {
  const existing = ids.filter(Boolean)
  if (existing.length === 0) return
  await supabaseFetch(page.request, admin, `${table}?id=in.(${existing.join(',')})`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  }).catch(() => null)
}

function inputHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

test.describe('Mission Control Commerce context evidence', () => {
  test.describe.configure({ timeout: 8 * 60_000 })

  test('uses real Commerce data to attach context and feed Daily Intel', async ({ page }) => {
    const admin = getSupabaseAdminContext()
    test.skip(!admin, 'Supabase service-role env is required for unmocked Commerce evidence E2E.')
    test.skip(
      process.env.FEATURE_AGENT_COMMERCE !== 'true' || process.env.FEATURE_AGENT_COMMERCE_WALLETS !== 'true',
      'Agent Commerce wallets feature flags are disabled in this environment.',
    )

    const workspace = await getWorkspaceContext(page)
    const stamp = Date.now()
    const spendRequestId = randomUUID()
    const eventId = randomUUID()
    const knowledgeId = randomUUID()
    const now = new Date().toISOString()
    const idempotencyKey = `e2e-commerce-${stamp}`
    const providerEventId = `provider-event-${stamp}`
    const merchantName = `E2E Evidence Merchant ${stamp}`
    const requestId = `request-${stamp}`
    const runId = `run-${stamp}`
    const ledgerId = `ledger-${stamp}`
    const sellerId = `seller-${stamp}`
    const budgetReservationId = `budget-${stamp}`
    const createdRecords: { contextRecordId?: string; teamId?: string } = {}

    try {
      const teamResult = await createTeam(page, {
        orgId: workspace.org.id,
        projectId: workspace.project.id,
        name: `Commerce Evidence Team ${stamp}`,
        objective: 'Verify unmocked Commerce context attachment from Mission Control.',
      })
      expect(teamResult.status, JSON.stringify(teamResult.body)).toBe(201)
      const teamId = (teamResult.body?.id ?? teamResult.body?.crew?.id) as string | undefined
      expect(teamId).toBeTruthy()
      createdRecords.teamId = teamId

      await insertSupabaseRow(page, admin!, 'agent_spend_requests', {
        id: spendRequestId,
        contract_version: '2026-05-01',
        schema_version: 1,
        org_id: workspace.org.id,
        project_id: workspace.project.id,
        assistant_id: null,
        user_id: null,
        run_id: runId,
        tool_call_id: null,
        idempotency_key: idempotencyKey,
        provider: 'manual',
        rail: 'manual_approval',
        status: 'completed',
        merchant: {
          name: merchantName,
          domain: 'evidence.example',
          country: 'US',
        },
        amount_cents: 4200,
        currency: 'usd',
        context: 'E2E Commerce provenance verification',
        policy_snapshot: {},
        router_decision: {},
        provider_request_id: `provider-request-${stamp}`,
        provider_credential_id: null,
        credential_kind: null,
        approval_required: false,
        approved_by: null,
        approved_at: null,
        expires_at: null,
        created_at: now,
        updated_at: now,
        completed_at: now,
        metadata: { e2e: true, evidence_spec: 'commerce-context-evidence' },
      })

      await insertSupabaseRow(page, admin!, 'agent_commerce_events', {
        id: eventId,
        contract_version: '2026-05-01',
        schema_version: 1,
        stack_id: 'commerce',
        org_id: workspace.org.id,
        entity_type: 'spend_request',
        entity_id: spendRequestId,
        event_type: 'spend_request.completed',
        provider: 'manual',
        provider_event_id: providerEventId,
        actor_type: 'system',
        actor_id: null,
        request_id: requestId,
        run_id: runId,
        payload: {
          outcome: 'succeeded',
          status: 'completed',
          idempotency_key: idempotencyKey,
          budget_reservation_id: budgetReservationId,
          seller_id: sellerId,
          ledger_id: ledgerId,
          project_id: workspace.project.id,
          amount: 4200,
          currency: 'usd',
        },
        created_at: now,
      })

      const knowledgeInput = {
        evidence: [{
          kind: 'commerce_event',
          commerceEventId: eventId,
          label: 'spend_request.completed',
          provider: 'manual',
          outcome: 'succeeded',
          status: 'completed',
        }],
        source: { type: 'agent_commerce', label: 'manual' },
      }
      await insertSupabaseRow(page, admin!, 'knowledge_operation_events', {
        id: knowledgeId,
        org_id: workspace.org.id,
        actor_user_id: null,
        operation_id: 'knowledge.write_project',
        surface: 'agent_ops',
        success: true,
        duration_ms: 0,
        input_hash: inputHash(knowledgeInput),
        output_summary: 'Commerce evidence: spend_request.completed · succeeded · completed · manual.',
        error_code: null,
        error_message: null,
        metadata: {
          evidence_kind: 'commerce_event',
          commerce_event_id: eventId,
          entity_type: 'spend_request',
          entity_id: spendRequestId,
          event_type: 'spend_request.completed',
          provider: 'manual',
          project_id: workspace.project.id,
          request_id: requestId,
          run_id: runId,
          provider_event_id: providerEventId,
          idempotency_key: idempotencyKey,
          budget_reservation_id: budgetReservationId,
          seller_id: sellerId,
          ledger_id: ledgerId,
          outcome: 'succeeded',
          status: 'completed',
          amount: 4200,
          currency: 'usd',
          entity_snapshot: {
            merchant: merchantName,
            context: 'E2E Commerce provenance verification',
          },
        },
        created_at: now,
      })

      const commerceApiResponse = await page.request.get(
        `/api/mission-control/commerce?org_id=${workspace.org.id}&limit=100`,
        { failOnStatusCode: false, timeout: 120_000 },
      )
      expect(
        commerceApiResponse.ok(),
        `Commerce API failed before UI assertions: ${await commerceApiResponse.text()}`,
      ).toBe(true)

      await page.goto(`/${workspace.org.slug}/mission-control/commerce`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })
      await expect(page.getByRole('heading', { name: merchantName })).toBeVisible({ timeout: 120_000 })
      await page.getByRole('button', { name: /Detail/i }).first().click()

      await expect(page.getByRole('heading', { name: /spend request completed/i })).toBeVisible({ timeout: 90_000 })
      await expect(page.getByText('Provenance', { exact: true })).toBeVisible()
      await expect(page.getByText('Knowledge Rows', { exact: true })).toBeVisible()
      await expect(page.getByText(providerEventId).first()).toBeVisible()
      await expect(page.getByText(idempotencyKey).first()).toBeVisible()
      await expect(page.getByText(ledgerId).first()).toBeVisible()

      await page.locator('label', { hasText: 'Scope' }).getByRole('combobox').click()
      await page.getByRole('option', { name: 'Team' }).click()
      await page.getByRole('combobox', { name: 'Team' }).click()
      await page.getByRole('option', { name: `Commerce Evidence Team ${stamp}` }).click()
      await page.getByRole('button', { name: /^Attach$/ }).click()

      await expect(page.getByText('Attached to context.')).toBeVisible({ timeout: 90_000 })
      await expect(page.getByRole('link', { name: 'Open context' })).toBeVisible()
      await expect(page.getByText('Linked Context', { exact: true })).toBeVisible()
      await expect(page.getByText(/Commerce: spend request completed/i)).toBeVisible()

      const contextResponse = await supabaseFetch(
        page.request,
        admin!,
        `shared_context_records?select=id,source_type,source_id&source_type=eq.commerce_event&source_id=eq.${eventId}&limit=1`,
      )
      expect(contextResponse.ok()).toBe(true)
      const contextRows = await contextResponse.json() as Array<{ id: string }>
      expect(contextRows.length).toBeGreaterThan(0)
      createdRecords.contextRecordId = contextRows[0]?.id

      const csrfToken = await getCsrfToken(page)
      const dailyIntelResponse = await page.request.post(
        `/api/workspaces/${workspace.org.id}/projects/${workspace.project.id}/context/daily-intel`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          data: { lookback_hours: 24, publish: false },
          failOnStatusCode: false,
          timeout: 120_000,
        },
      )
      const dailyIntelPayload = {
        status: dailyIntelResponse.status(),
        body: await dailyIntelResponse.json() as {
          intel?: {
            inputs?: Array<{ source_type?: string | null; source_id?: string | null; title?: string; body?: string }>
            links?: Array<{ target_type?: string; target_id?: string }>
          }
        },
      }

      expect(dailyIntelPayload.status).toBe(200)
      expect(dailyIntelPayload.body.intel?.inputs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          source_type: 'commerce_event',
          source_id: eventId,
          title: 'Commerce: spend request completed',
        }),
      ]))
      expect(dailyIntelPayload.body.intel?.links).toEqual(expect.arrayContaining([
        expect.objectContaining({
          target_type: 'commerce_event',
          target_id: eventId,
        }),
      ]))
    } finally {
      await deleteSupabaseRows(page, admin!, 'shared_context_records', createdRecords.contextRecordId ? [createdRecords.contextRecordId] : [])
      await deleteSupabaseRows(page, admin!, 'knowledge_operation_events', [knowledgeId])
      await deleteSupabaseRows(page, admin!, 'agent_commerce_events', [eventId])
      await deleteSupabaseRows(page, admin!, 'agent_spend_requests', [spendRequestId])
      await deleteSupabaseRows(page, admin!, 'crews', createdRecords.teamId ? [createdRecords.teamId] : [])
    }
  })
})
