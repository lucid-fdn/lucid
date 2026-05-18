import 'server-only'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

type TelegramLogLevel = 'info' | 'warning' | 'error'

const LOGS_DIR = join(process.cwd(), 'logs')
const TELEGRAM_LOG_FILE = join(LOGS_DIR, 'telegram-server.log')

export async function appendTelegramServerLog(params: {
  event: string
  level?: TelegramLogLevel
  message: string
  context?: Record<string, unknown>
}) {
  try {
    await mkdir(LOGS_DIR, { recursive: true })

    const entry = {
      timestamp: new Date().toISOString(),
      level: params.level || 'info',
      event: params.event,
      message: params.message,
      context: params.context || {},
    }

    await appendFile(TELEGRAM_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8')
  } catch {
    // Never break request flow because file logging failed.
  }
}
