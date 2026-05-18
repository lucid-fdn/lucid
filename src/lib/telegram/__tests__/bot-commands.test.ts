import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  configureHostedTelegramCommands,
  HOSTED_TELEGRAM_COMMANDS,
  HOSTED_TELEGRAM_DESCRIPTION,
  HOSTED_TELEGRAM_MENU_BUTTON_TEXT,
  HOSTED_TELEGRAM_SHORT_DESCRIPTION,
  syncHostedTelegramSurface,
} from '../bot-commands'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('HOSTED_TELEGRAM_COMMANDS', () => {
  it('defines a compact private-chat command menu', () => {
    expect(HOSTED_TELEGRAM_COMMANDS).toEqual([
      { command: 'switch', description: 'Switch the active agent' },
      { command: 'workspace', description: 'Switch workspace for this chat' },
      { command: 'agents', description: 'List agents in this chat' },
      { command: 'whoami', description: 'Show the active agent' },
      { command: 'voice', description: 'Tune voice replies for this room' },
      { command: 'ops', description: 'Launch Agent Ops workflows' },
      { command: 'check', description: 'Check a page with Browser Operator' },
      { command: 'buy', description: 'Prepare a governed purchase' },
      { command: 'research', description: 'Research a website' },
      { command: 'plan', description: 'Start plan-only Agent Ops' },
      { command: 'search', description: 'Search Mission Control' },
      { command: 'remember', description: 'Save a Knowledge claim' },
      { command: 'claims', description: 'List Knowledge claims' },
      { command: 'forget', description: 'Archive a Knowledge claim' },
      { command: 'extract', description: 'Extract public web data' },
      { command: 'monitor', description: 'Monitor a page' },
      { command: 'help', description: 'Show Telegram bot help' },
      { command: 'leave', description: 'Remove the active agent' },
    ])
  })
})

describe('configureHostedTelegramCommands', () => {
  it('registers commands for all private chats', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })

    const result = await configureHostedTelegramCommands('test-token')

    expect(result).toEqual({ ok: true, description: undefined })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/setMyCommands',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const init = fetchMock.mock.calls[0][1] as { body: string }
    expect(JSON.parse(init.body)).toEqual({
      scope: { type: 'all_private_chats' },
      commands: HOSTED_TELEGRAM_COMMANDS,
    })
  })
})

describe('syncHostedTelegramSurface', () => {
  it('syncs commands, descriptions, and a web app menu button', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })

    const result = await syncHostedTelegramSurface('test-token', 'https://www.lucid.foundation')

    expect(result.commands.ok).toBe(true)
    expect(result.shortDescription.ok).toBe(true)
    expect(result.description.ok).toBe(true)
    expect(result.menuButton.ok).toBe(true)
    expect(result.menuButton.url).toBe('https://www.lucid.foundation/telegram/mini-app')
    expect(fetchMock).toHaveBeenCalledTimes(4)

    const [commandsCall, shortCall, descriptionCall, menuCall] = fetchMock.mock.calls

    expect(commandsCall[0]).toBe('https://api.telegram.org/bottest-token/setMyCommands')
    expect(shortCall[0]).toBe('https://api.telegram.org/bottest-token/setMyShortDescription')
    expect(descriptionCall[0]).toBe('https://api.telegram.org/bottest-token/setMyDescription')
    expect(menuCall[0]).toBe('https://api.telegram.org/bottest-token/setChatMenuButton')

    expect(JSON.parse((shortCall[1] as { body: string }).body)).toEqual({
      short_description: HOSTED_TELEGRAM_SHORT_DESCRIPTION,
    })
    expect(JSON.parse((descriptionCall[1] as { body: string }).body)).toEqual({
      description: HOSTED_TELEGRAM_DESCRIPTION,
    })
    expect(JSON.parse((menuCall[1] as { body: string }).body)).toEqual({
      menu_button: {
        type: 'web_app',
        text: HOSTED_TELEGRAM_MENU_BUTTON_TEXT,
        web_app: { url: 'https://www.lucid.foundation/telegram/mini-app' },
      },
    })
  })

  it('preserves Telegram error descriptions', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, description: 'Bad Request' }),
    }).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })

    const result = await syncHostedTelegramSurface('test-token', 'https://www.lucid.foundation')

    expect(result.commands).toEqual({ ok: false, description: 'Bad Request' })
    expect(result.shortDescription.ok).toBe(true)
    expect(result.description.ok).toBe(true)
    expect(result.menuButton.ok).toBe(true)
  })
})
