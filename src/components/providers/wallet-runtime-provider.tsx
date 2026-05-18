'use client'

import type { ReactNode } from 'react'
import { WalletProvider } from '@/components/Wallet/WalletProvider'

export function WalletRuntimeProvider({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>
}
