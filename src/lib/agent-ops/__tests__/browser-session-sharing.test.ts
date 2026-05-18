import { describe, expect, it } from 'vitest'

import {
  buildBrowserSessionShareAction,
  buildBrowserSessionSharingRuntimeContext,
  buildBrowserSessionTabIdentity,
  createBrowserSessionShareSecret,
  hashBrowserSessionShareToken,
  serializeBrowserSessionSharingForRuntime,
} from '../browser-session-sharing'

describe('Browser session sharing', () => {
  it('creates one-time share secrets that can be stored by hash only', () => {
    const secret = createBrowserSessionShareSecret()

    expect(secret.token).toMatch(/^lucid_browser_share_/)
    expect(secret.tokenHash).toBe(hashBrowserSessionShareToken(secret.token))
    expect(secret.tokenPrefix).toBe(secret.token.slice(0, 24))
    expect(secret.tokenHash).not.toContain(secret.token)
  })

  it('serializes provider-neutral sharing policy for runtimes', () => {
    const runtime = serializeBrowserSessionSharingForRuntime(
      buildBrowserSessionSharingRuntimeContext({ actionsPerMinute: 12, defaultTtlSeconds: 600 }),
    )

    expect(runtime).toMatchObject({
      schema_version: 1,
      token_table: 'agent_ops_browser_session_shares',
      action_table: 'agent_ops_browser_session_actions',
      default_ttl_seconds: 600,
      isolation: 'per_agent_tab',
      attribution_required: true,
      external_sharing: 'disabled_until_reviewed',
      rate_limit: { actions_per_minute: 12 },
    })
    expect(runtime.allowed_scopes).toEqual(expect.arrayContaining([
      'read-only',
      'browser-drive',
      'screenshot-only',
      'handoff-only',
    ]))
  })

  it('builds stable tab identities and attributed share actions', () => {
    const tabIdentity = buildBrowserSessionTabIdentity({
      runId: 'run-1',
      sessionKey: 'session-1',
      assistantId: 'assistant-1',
      runtimeId: 'shared',
      agentLabel: 'Browser QA Specialist',
    })
    const action = buildBrowserSessionShareAction({
      sessionKey: 'session-1',
      actionType: 'tab_assigned',
      scope: 'read-only',
      actorRuntimeId: 'shared',
      actorAgentLabel: 'Browser QA Specialist',
      tabIdentity,
      currentUrl: 'https://example.com',
    })

    expect(tabIdentity).toMatch(/^tab_[a-f0-9]{16}$/)
    expect(action).toMatchObject({
      session_key: 'session-1',
      action_type: 'tab_assigned',
      status: 'allowed',
      scope: 'read-only',
      actor_runtime_id: 'shared',
      actor_agent_label: 'Browser QA Specialist',
      tab_identity: tabIdentity,
      current_url: 'https://example.com',
    })
  })
})
