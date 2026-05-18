'use client'

import { useMemo, type ReactNode } from 'react'
import { PrivyProvider } from '@privy-io/react-auth'
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana'
import { useTheme } from 'next-themes'
import { isWeb3Enabled } from '@/lib/auth/client-config'

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? ''

type SolanaWalletConnectors = ReturnType<typeof toSolanaWalletConnectors>
type SolanaWalletConnector = ReturnType<SolanaWalletConnectors['get']>[number]
type SolanaWalletConnectorsWithUpdates = SolanaWalletConnectors & {
  _setOnConnectorsUpdated?: (onUpdate: (connectors: SolanaWalletConnector[]) => void) => void
}

function toSolanaWalletConnectorsWithoutQr(): SolanaWalletConnectors {
  const connectors = toSolanaWalletConnectors() as SolanaWalletConnectorsWithUpdates
  const withoutWalletConnectQr = (items: SolanaWalletConnector[]) =>
    items.filter((connector) => connector.walletClientType !== 'walletconnect_solana')

  return {
    onMount: connectors.onMount,
    onUnmount: connectors.onUnmount,
    get: () => withoutWalletConnectQr(connectors.get()),
    _setOnConnectorsUpdated: connectors._setOnConnectorsUpdated
      ? (onUpdate: (connectors: SolanaWalletConnector[]) => void) =>
        connectors._setOnConnectorsUpdated?.((items) => onUpdate(withoutWalletConnectQr(items)))
      : undefined,
  } as SolanaWalletConnectors
}

export function PrivyRuntimeProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme()
  const privyTheme = resolvedTheme === 'light' ? 'light' : 'dark'
  const privyLogo = resolvedTheme === 'light'
    ? (process.env.NEXT_PUBLIC_APP_LOGO || '/lucid.png')
    : (process.env.NEXT_PUBLIC_APP_LOGO || '/lucid_w.gif')
  const enableSolanaWallets = isWeb3Enabled()
  const solanaWalletConnectors = useMemo(
    () => enableSolanaWallets ? toSolanaWalletConnectorsWithoutQr() : null,
    [enableSolanaWallets],
  )

  const walletList = enableSolanaWallets
    ? ([
        'phantom',
        'backpack',
        'metamask',
        'detected_solana_wallets',
        'detected_ethereum_wallets',
        'rainbow',
        'coinbase_wallet',
      ] as const)
    : ([
        'metamask',
        'detected_ethereum_wallets',
        'rainbow',
        'coinbase_wallet',
      ] as const)

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'wallet', 'google'],
        appearance: {
          theme: privyTheme,
          accentColor: '#2563eb',
          logo: privyLogo,
          showWalletLoginFirst: true,
          walletChainType: enableSolanaWallets ? 'ethereum-and-solana' : 'ethereum-only',
          walletList: [...walletList] as any,
        },
        ...(solanaWalletConnectors
          ? {
              externalWallets: {
                solana: {
                  connectors: solanaWalletConnectors,
                },
              },
            }
          : {}),
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
          ...(enableSolanaWallets ? { solana: { createOnLogin: 'users-without-wallets' } } : {}),
        },
        supportedChains: [
          {
            id: 1,
            name: 'Ethereum',
            network: 'mainnet',
            nativeCurrency: {
              name: 'Ether',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: {
              default: { http: ['https://eth.llamarpc.com'] },
              public: { http: ['https://eth.llamarpc.com'] },
            },
          },
        ],
      } as any}
    >
      {children}
    </PrivyProvider>
  )
}
