'use client'

import { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'

// Default styles for wallet modal
import '@solana/wallet-adapter-react-ui/styles.css'

// Proxy through our API to keep QuickNode URL private. The Solana wallet
// adapter requires an absolute http(s) endpoint, so resolve the app-relative
// proxy URL at the provider boundary instead of leaking provider RPC URLs.
function resolveSolanaRpcProxyUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SOLANA_RPC_PROXY_URL?.trim()
  if (configured?.startsWith('http://') || configured?.startsWith('https://')) {
    return configured
  }

  if (typeof window !== 'undefined') {
    return new URL('/api/rpc/solana', window.location.origin).toString()
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000'
  return new URL('/api/rpc/solana', appUrl).toString()
}

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], [])
  const endpoint = useMemo(resolveSolanaRpcProxyUrl, [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
