import type { Metadata } from 'next'
import { TelegramMiniAppClient } from '@/components/telegram/mini-app-client'

export const metadata: Metadata = {
  title: 'Lucid Telegram Control',
  robots: {
    index: false,
    follow: false,
  },
}

export default function TelegramMiniAppPage() {
  return <TelegramMiniAppClient />
}
