/**
 * Per-guild slash command registration for the hosted Discord bot.
 *
 * Called once at the end of the OAuth install flow to teach a freshly-added
 * guild about /agents, /switch, /whoami, /models, /model, /leave, and /help.
 * Discord lets us scope the command registration to a single guild, which
 * propagates almost instantly. Global commands can take much longer to fan out.
 *
 * This file is deliberately thin. It is a single POST to Discord's REST API
 * with a static command manifest. Keep the manifest here so the webhook
 * handler and the install route agree on the exact command shape.
 *
 * Spec: docs/plans/2026-04-08-discord-byob-and-shared-bot.md section 2c
 */

const OPTION_TYPE = {
  STRING: 3,
  CHANNEL: 7,
} as const

export const HOSTED_GUILD_COMMANDS = [
  {
    name: 'agents',
    description: 'List agents installed in this server and pick the active one',
    type: 1,
  },
  {
    name: 'switch',
    description: 'Switch the active agent by name',
    type: 1,
    options: [
      {
        name: 'name',
        description: 'Agent name (supports substring match)',
        type: OPTION_TYPE.STRING,
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'whoami',
    description: 'Show the currently active agent in this server',
    type: 1,
  },
  {
    name: 'status',
    description: 'Show routing, delivery, voice, and model details for the active agent',
    type: 1,
  },
  {
    name: 'ops',
    description: 'Run Agent Ops, Knowledge, or capability template commands from this server',
    type: 1,
    options: [
      {
        name: 'workflow',
        description: 'check, buy, research, search, remember, claims, whales, token, markets, portfolio, copy, or web3',
        type: OPTION_TYPE.STRING,
        required: true,
        autocomplete: true,
      },
      {
        name: 'target',
        description: 'URL, PR, branch, repository, incident, or short target description',
        type: OPTION_TYPE.STRING,
        required: false,
      },
    ],
  },
  {
    name: 'probe',
    description: 'Run a live hosted Discord bot health probe',
    type: 1,
  },
  {
    name: 'voice',
    description: 'Inspect or change Discord voice replies for the active agent',
    type: 1,
    options: [
      {
        name: 'mode',
        description: 'Voice reply mode',
        type: OPTION_TYPE.STRING,
        required: false,
        autocomplete: true,
      },
      {
        name: 'name',
        description: 'Voice id (for example coral, onyx, echo)',
        type: OPTION_TYPE.STRING,
        required: false,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'vc',
    description: 'Join, leave, or inspect a hosted Discord voice session',
    type: 1,
    options: [
      {
        name: 'action',
        description: 'join, leave, or status',
        type: OPTION_TYPE.STRING,
        required: true,
        autocomplete: true,
      },
      {
        name: 'channel',
        description: 'Voice channel to join',
        type: OPTION_TYPE.CHANNEL,
        required: false,
        channel_types: [2, 13],
      },
    ],
  },
  {
    name: 'models',
    description: 'Show the active agent model and suggested alternatives',
    type: 1,
  },
  {
    name: 'model',
    description: 'Set the active agent model (admin only)',
    type: 1,
    options: [
      {
        name: 'name',
        description: 'Model id or name',
        type: OPTION_TYPE.STRING,
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'leave',
    description: 'Unbind the active agent from this server (admin only)',
    type: 1,
  },
  {
    name: 'help',
    description: 'Show the Lucid bot command list',
    type: 1,
  },
] as const

export interface RegisterGuildCommandsInput {
  clientId: string
  botToken: string
  guildId: string
  fetchImpl?: typeof fetch
}

export async function registerGuildCommands(
  input: RegisterGuildCommandsInput,
): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch
  const url = `https://discord.com/api/v10/applications/${input.clientId}/guilds/${input.guildId}/commands`
  const res = await fetchImpl(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${input.botToken}`,
    },
    body: JSON.stringify(HOSTED_GUILD_COMMANDS),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `Discord guild command registration failed (${res.status}): ${body.slice(0, 500)}`,
    )
  }
}
