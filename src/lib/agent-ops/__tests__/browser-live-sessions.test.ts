import { describe, expect, it } from 'vitest'

import {
  buildBrowserLiveSessionRuntimeContext,
  buildBrowserSessionTimelineEvents,
  serializeBrowserLiveSessionForRuntime,
} from '../browser-live-sessions'

describe('Browser live sessions', () => {
  it('serializes provider-neutral live session and handoff policy context', () => {
    const runtime = serializeBrowserLiveSessionForRuntime(buildBrowserLiveSessionRuntimeContext())

    expect(runtime).toMatchObject({
      schema_version: 1,
      event_stream: 'agent_ops_browser_session_events',
      resume_policy: 'human_resolves_then_agent_resumes',
    })
    expect(runtime.handoff_states).toEqual(expect.arrayContaining([
      'auth_required',
      'captcha_required',
      'mfa_required',
    ]))
  })

  it('builds a handoff timeline instead of silently completing blocked sessions', () => {
    const events = buildBrowserSessionTimelineEvents({
      sessionKey: 'session-key',
      targetUrl: 'https://app.example.com/login',
      finalUrl: 'https://app.example.com/login',
      provider: 'lucid-managed',
      targetId: 'target-1',
      screenshotUri: 'artifact://screenshot',
      trustShieldState: 'protected',
      handoffState: 'auth_required',
      handoffMessage: 'Login required.',
    })

    expect(events.map((event) => event.event_type)).toEqual([
      'session_started',
      'navigated',
      'evidence_collected',
      'handoff_required',
    ])
    expect(events[3]).toMatchObject({
      severity: 'warn',
      handoff_state: 'auth_required',
      message: 'Login required.',
    })
  })
})
