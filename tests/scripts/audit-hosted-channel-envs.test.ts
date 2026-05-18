import { describe, expect, it } from 'vitest'

import {
  computeHostedChannelEnvAudit,
  namesForTargetEnv,
  parseVercelEnvRows,
} from '../../scripts/audit-hosted-channel-envs.mjs'

describe('audit-hosted-channel-envs', () => {
  it('parses vercel env output rows', () => {
    const rows = parseVercelEnvRows(`
 name                                               value               environments (git branch)           created
 FEATURE_SLACK_HOSTED                               Encrypted           Production                          1d ago
 DISCORD_HOSTED_CLIENT_ID                           Encrypted           Preview                             2d ago
 Vercel CLI 48.0.1
 Retrieving project...
 > Environment Variables found for org/project [927ms]
`)

    expect(rows).toEqual([
      { name: 'FEATURE_SLACK_HOSTED', environments: 'production' },
      { name: 'DISCORD_HOSTED_CLIENT_ID', environments: 'preview' },
    ])
  })

  it('filters names for the requested environment', () => {
    const names = namesForTargetEnv([
      { name: 'FEATURE_SLACK_HOSTED', environments: 'production' },
      { name: 'DISCORD_HOSTED_CLIENT_ID', environments: 'preview, production' },
    ], 'production')

    expect(names).toEqual(new Set(['FEATURE_SLACK_HOSTED', 'DISCORD_HOSTED_CLIENT_ID']))
  })

  it('reports missing hosted envs per channel', () => {
    const results = computeHostedChannelEnvAudit([
      { name: 'FEATURE_SLACK_HOSTED', environments: 'production' },
      { name: 'SLACK_HOSTED_CLIENT_ID', environments: 'production' },
      { name: 'SLACK_HOSTED_CLIENT_SECRET', environments: 'production' },
      { name: 'SLACK_HOSTED_APP_TOKEN', environments: 'production' },
      { name: 'SLACK_HOSTED_STATE_SECRET', environments: 'production' },
      { name: 'FEATURE_OPENCLAW_CHANNELS_SLACK_MANAGED', environments: 'production' },
      { name: 'FEATURE_TEAMS_HOSTED', environments: 'production' },
      { name: 'MSTEAMS_HOSTED_INSTALL_URL', environments: 'production' },
      { name: 'MSTEAMS_HOSTED_APP_ID', environments: 'production' },
      { name: 'MSTEAMS_HOSTED_APP_PASSWORD', environments: 'production' },
      { name: 'MSTEAMS_HOSTED_TENANT_ID', environments: 'production' },
      { name: 'MSTEAMS_HOSTED_STATE_SECRET', environments: 'production' },
      { name: 'FEATURE_OPENCLAW_CHANNELS_TEAMS_MANAGED', environments: 'production' },
      { name: 'FEATURE_OPENCLAW_CHANNELS_DISCORD_MANAGED', environments: 'production' },
    ], 'production')

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channel: 'discord',
        ok: false,
        missing: expect.arrayContaining([
          'FEATURE_DISCORD_HOSTED',
          'DISCORD_HOSTED_CLIENT_ID',
          'DISCORD_HOSTED_CLIENT_SECRET',
        ]),
      }),
      expect.objectContaining({ channel: 'slack', ok: true, missing: [] }),
      expect.objectContaining({ channel: 'msteams', ok: true, missing: [] }),
      expect.objectContaining({
        channel: 'whatsapp',
        ok: false,
        missing: expect.arrayContaining([
          'FEATURE_WHATSAPP_HOSTED',
          'WHATSAPP_HOSTED_PHONE_NUMBER_ID',
          'WHATSAPP_HOSTED_ACCESS_TOKEN',
        ]),
      }),
    ]))
  })
})
