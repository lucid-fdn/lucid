import { Metadata } from 'next'
import { TradingAdminClient } from './trading-admin-client'

export const metadata: Metadata = {
  title: 'Trading Admin | Settings',
  description: 'Monitor and manage autonomous trading transactions',
}

export default function TradingAdminPage() {
  return <TradingAdminClient />
}