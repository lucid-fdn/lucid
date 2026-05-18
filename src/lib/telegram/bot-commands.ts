export interface TelegramBotCommand {
  command: string
  description: string
}

export const HOSTED_TELEGRAM_COMMANDS: TelegramBotCommand[] = [
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
]

export const HOSTED_TELEGRAM_SHORT_DESCRIPTION =
  'Operate Lucid agents in Telegram with handoffs, workspace control, and a built-in menu.'

export const HOSTED_TELEGRAM_DESCRIPTION =
  'Talk to Lucid agents in Telegram. Switch the active agent, move the chat across workspaces, and open the Lucid menu without leaving Telegram.'

export const HOSTED_TELEGRAM_MENU_BUTTON_TEXT = 'Menu'

type TelegramMethodResult = {
  ok: boolean
  description?: string
}

export type HostedTelegramSurfaceSyncResult = {
  commands: TelegramMethodResult
  shortDescription: TelegramMethodResult
  description: TelegramMethodResult
  menuButton: TelegramMethodResult & { url?: string }
}

async function callTelegramMethod(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramMethodResult> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null

  return {
    ok: Boolean(res.ok && payload?.ok),
    description: payload?.description,
  }
}

export async function configureHostedTelegramCommands(botToken: string): Promise<TelegramMethodResult> {
  return callTelegramMethod(botToken, 'setMyCommands', {
    scope: { type: 'all_private_chats' },
    commands: HOSTED_TELEGRAM_COMMANDS,
  })
}

export async function configureHostedTelegramShortDescription(
  botToken: string,
): Promise<TelegramMethodResult> {
  return callTelegramMethod(botToken, 'setMyShortDescription', {
    short_description: HOSTED_TELEGRAM_SHORT_DESCRIPTION,
  })
}

export async function configureHostedTelegramDescription(
  botToken: string,
): Promise<TelegramMethodResult> {
  return callTelegramMethod(botToken, 'setMyDescription', {
    description: HOSTED_TELEGRAM_DESCRIPTION,
  })
}

export async function configureHostedTelegramMenuButton(
  botToken: string,
  appBaseUrl: string,
): Promise<TelegramMethodResult & { url?: string }> {
  const url = `${appBaseUrl.replace(/\/$/, '')}/telegram/mini-app`
  const result = await callTelegramMethod(botToken, 'setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: HOSTED_TELEGRAM_MENU_BUTTON_TEXT,
      web_app: { url },
    },
  })

  return {
    ...result,
    url,
  }
}

export async function syncHostedTelegramSurface(
  botToken: string,
  appBaseUrl: string,
): Promise<HostedTelegramSurfaceSyncResult> {
  const [commands, shortDescription, description, menuButton] = await Promise.all([
    configureHostedTelegramCommands(botToken),
    configureHostedTelegramShortDescription(botToken),
    configureHostedTelegramDescription(botToken),
    configureHostedTelegramMenuButton(botToken, appBaseUrl),
  ])

  return {
    commands,
    shortDescription,
    description,
    menuButton,
  }
}
