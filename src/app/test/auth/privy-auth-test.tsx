'use client'

import React, { useEffect, useState } from 'react'
import { useLogin, usePrivy, useWallets } from '@privy-io/react-auth'

import { InteractiveGridPattern } from '@/ui/components/interactive-grid-pattern'
import { Link } from '@/components/link'
import { Logo as LogoAnimated } from '@/components/logo-animated'
import { Button } from '@/components/ui/button'
import { Heading, Subheading } from '@/components/text-marketing'
import { cn } from '@/lib/utils'
import { maskIdentifier, maskWalletAddress } from '@/lib/logging/safe-log'

const DEBUG_AUTH_TEST = process.env.NEXT_PUBLIC_DEBUG_AUTH_TEST === 'true'

function debugAuthTest(message: string, metadata?: Record<string, unknown>) {
  if (!DEBUG_AUTH_TEST) return
  console.debug(`[test-auth] ${message}`, metadata)
}

function getChromeRuntime() {
  if (typeof window === 'undefined') return undefined

  const chromeApi = (window as typeof window & {
    chrome?: {
      runtime?: {
        sendMessage?: (extensionId: string, message: Record<string, unknown>) => void
      }
    }
  }).chrome

  return chromeApi?.runtime
}

export default function PrivyAuthTestPage() {
  const { ready, authenticated, user, logout } = usePrivy()
  const { login } = useLogin({
    onComplete: ({ user, isNewUser, loginMethod, loginAccount }) => {
      debugAuthTest('Authentication finished', {
        userId: maskIdentifier(user?.id),
        isNewUser,
        loginMethod,
        loginAccount: loginAccount?.type,
        hasWalletData: !!user?.wallet,
        linkedAccounts: user?.linkedAccounts?.length || 0,
        timestamp: new Date().toISOString(),
      })
    },
  })
  const { wallets } = useWallets()
  const [isLoading, setIsLoading] = useState(true)

  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const extensionId = urlParams?.get('extension_id') || ''
  const isLogout = urlParams?.get('logout') === '1'

  useEffect(() => {
    debugAuthTest('State change', {
      ready,
      authenticated,
      hasUser: !!user,
      userId: maskIdentifier(user?.id),
      walletsCount: wallets?.length || 0,
      extensionId: maskIdentifier(extensionId),
      isLogout,
      timestamp: new Date().toISOString(),
    })
  }, [ready, authenticated, user, wallets, extensionId, isLogout])

  useEffect(() => {
    if (!wallets) {
      debugAuthTest('No wallets object yet')
      return
    }

    debugAuthTest('Wallet state updated', {
      count: wallets.length,
      wallets: wallets.map((wallet, index) => ({
        index,
        address: maskWalletAddress(wallet.address),
        walletClientType: wallet.walletClientType,
        chainId: wallet.chainId,
        connectorType: wallet.connectorType,
        imported: wallet.imported,
      })),
      timestamp: new Date().toISOString(),
    })
  }, [wallets])

  useEffect(() => {
    if (!ready) return

    if (isLogout && authenticated) {
      debugAuthTest('Logging out from Privy')
      logout()
      return
    }

    if (authenticated && wallets && wallets.length > 0) {
      debugAuthTest('Wallets from Privy', { count: wallets.length })
      wallets.forEach((wallet, index: number) => {
        debugAuthTest(`Wallet ${index + 1}`, {
          address: maskWalletAddress(wallet.address),
          walletClientType: wallet.walletClientType,
          connectorType: wallet.connectorType,
          imported: wallet.imported,
          walletIndex: wallet.walletIndex,
        })
      })

      const evmWallet = wallets.find((wallet) => wallet.walletClientType !== 'solana')
      const solanaWallet = wallets.find((wallet) => wallet.walletClientType === 'solana')

      const payload = {
        userId: user?.id || null,
        address: evmWallet?.address || null,
        solanaAddress: solanaWallet?.address || null,
        walletType: evmWallet?.walletClientType || null,
        solanaWalletType: solanaWallet?.walletClientType || 'solana',
        walletCount: wallets.length,
        hasSolanaWallet: !!solanaWallet,
        hasEvmWallet: !!evmWallet,
        preferredWallet: solanaWallet ? 'solana' : 'evm',
      }

      debugAuthTest('Sending to extension', {
        ...payload,
        userId: maskIdentifier(payload.userId),
        address: maskWalletAddress(payload.address),
        solanaAddress: maskWalletAddress(payload.solanaAddress),
      })
      debugAuthTest('Extension id', { extensionId: maskIdentifier(extensionId) })

      const chromeRuntime = getChromeRuntime()
      if (chromeRuntime?.sendMessage && extensionId) {
        chromeRuntime.sendMessage(extensionId, { type: 'privy_authenticated', payload })
      }
    }
  }, [ready, authenticated, user, wallets, logout, isLogout, extensionId])

  useEffect(() => {
    if (!ready || !isLogout || authenticated) return

    debugAuthTest('Logout complete')
    const chromeRuntime = getChromeRuntime()
    if (chromeRuntime?.sendMessage && extensionId) {
      chromeRuntime.sendMessage(extensionId, { type: 'privy_logged_out' })
    }
    setTimeout(() => window.close(), 1000)
  }, [ready, authenticated, isLogout, extensionId])

  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 800)
    return () => clearTimeout(timer)
  }, [ready])

  if (!ready || isLoading) {
    return (
      <AuthChrome squares={[40, 40]}>
        <div className="w-full max-w-md rounded-xl bg-neutral-900/80 p-7 shadow-md ring-1 ring-black/5 backdrop-blur-md sm:p-11">
          <div className="flex items-center justify-center">
            <LogoAnimated className="h-14 w-14" />
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">Loading...</p>
        </div>
      </AuthChrome>
    )
  }

  if (isLogout) {
    return (
      <AuthChrome>
        <AuthCard>
          <div className="mb-6 flex items-center justify-center">
            <LogoAnimated className="h-14 w-14" />
          </div>
          <Heading dark className="text-base/6 font-medium">
            {authenticated ? 'Logging out...' : 'Logged Out'}
          </Heading>
        </AuthCard>
      </AuthChrome>
    )
  }

  if (authenticated) {
    return (
      <AuthChrome>
        <AuthCard>
          <div className="mb-6 flex items-center justify-center">
            <Link href="/" title="Home">
              <LogoAnimated className="h-14 w-14" />
            </Link>
          </div>
          <Heading dark className="mb-4 text-base/6 font-medium text-green-500">
            Connected!
          </Heading>
          <Subheading dark className="mt-1 text-sm/5 text-muted-foreground">
            You can go back to the extension now.
          </Subheading>
        </AuthCard>
      </AuthChrome>
    )
  }

  return (
    <AuthChrome>
      <AuthCard>
        <div className="flex items-center justify-center">
          <Link href="/" title="Home">
            <LogoAnimated className="h-14 w-14" />
          </Link>
        </div>
        <Heading dark className="mt-8 text-base/6 font-medium">
          Connect Your Wallet
        </Heading>
        <Subheading dark className="mt-1 text-sm/5 text-muted-foreground">
          Connect your wallet to start earning mGas
        </Subheading>
        <div className="mt-8">
          <Button
            onClick={() => login()}
            className="w-full rounded-full bg-blue-600 text-white hover:bg-blue-700"
          >
            Connect Wallet
          </Button>
        </div>
      </AuthCard>
    </AuthChrome>
  )
}

function AuthChrome({
  children,
  squares = [39, 39],
}: {
  children: React.ReactNode
  squares?: [number, number]
}) {
  return (
    <main className="bg-background relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden">
      <InteractiveGridPattern
        squares={squares}
        className={cn(
          'absolute inset-0',
          '[mask-image:radial-gradient(500px_circle_at_center,white,transparent)]',
          'skew-y-12',
        )}
      />
      <div className="isolate relative z-10 flex items-center justify-center p-6 lg:p-8">
        {children}
      </div>
    </main>
  )
}

function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-xl bg-neutral-900/90 shadow-md ring-1 ring-black/5 backdrop-blur-md">
      <div className="p-7 text-center sm:p-11">{children}</div>
    </div>
  )
}
