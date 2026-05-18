'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { InteractiveGridPattern } from '@/ui/components/interactive-grid-pattern'
import { Link } from '@/components/link'
import { Logo as LogoAnimated } from '@/components/logo-animated'
import { Button } from '@/components/ui/button'
import { Heading, Subheading } from '@/components/text-marketing'
import { getPendingUpgrade, clearPendingUpgrade } from '@/lib/upgrade-flow'
import { usePrivy, useLogout } from '@privy-io/react-auth'
import { isAuthMisconfigured, isPrivyAuth } from '@/lib/auth/client-config'
import { useAuth } from '@/contexts/auth-context'
import { LocalLoginForm } from './local-login-form'
import { cn } from '@/lib/utils'

/** Privy login — wallet / Google / email via Privy modal. */
function PrivyLoginContent() {
  // Safe to call usePrivy — this component is only rendered inside PrivyProvider
  const { ready, authenticated, login } = usePrivy()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(true)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { logout: _logout } = useLogout({
    onSuccess: async () => {
      try {
        await fetch('/api/auth/clear-token', { method: 'POST', credentials: 'include' })
      } catch {
        // Silent fail
      }
      router.push('/login')
    }
  })

  const handleWalletLogin = () => {
    login({
      loginMethods: ['wallet'],
      walletChainType: 'ethereum-and-solana'
    })
  }

  const handleEmailLogin = () => { login({ loginMethods: ['email'] }) }
  const handleGoogleLogin = () => { login({ loginMethods: ['google'] }) }

  useEffect(() => {
    if (ready && authenticated) {
      const nativeHandoff = searchParams?.get('native_handoff')
      if (nativeHandoff) {
        fetch(`/api/native/session/handoff/${encodeURIComponent(nativeHandoff)}/complete`, {
          method: 'POST',
          credentials: 'include',
        })
          .then((response) => response.json())
          .then((payload: { redirectUrl?: string }) => {
            window.location.assign(payload.redirectUrl ?? '/dashboard')
          })
          .catch(() => {
            router.push('/dashboard')
          })
        return
      }

      const pendingUpgrade = getPendingUpgrade()
      if (pendingUpgrade) {
        clearPendingUpgrade()
        router.push(`/settings/billing?upgrade=${pendingUpgrade.plan}&period=${pendingUpgrade.period}`)
      } else {
        const next = searchParams?.get('next')
        router.push(next && next.startsWith('/') ? next : '/dashboard')
      }
    }
  }, [ready, authenticated, router, searchParams])

  useEffect(() => {
    if (ready) {
      const timer = setTimeout(() => setIsLoading(false), 800)
      return () => clearTimeout(timer)
    }
  }, [ready])

  if (!ready || isLoading || authenticated) {
    return (
      <div className={`isolate flex items-center justify-center p-6 lg:p-8 transition-opacity duration-500 relative z-10 ${!ready ? 'opacity-100' : 'opacity-0'}`}>
        <div className="w-full max-w-md rounded-xl bg-card/90 backdrop-blur-md shadow-md ring-1 ring-border p-7 sm:p-11">
          <div className="flex items-center justify-center">
            <LogoAnimated className="h-14 w-14" />
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {authenticated ? 'Redirecting...' : 'Loading...'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="isolate flex items-center justify-center p-6 lg:p-8 relative z-10">
      <div className="w-full max-w-md rounded-xl bg-card/90 backdrop-blur-md shadow-md ring-1 ring-border">
        <div className="p-7 sm:p-11 text-center">
          <div className="flex items-center justify-center">
            <Link href="/" title="Home">
              <LogoAnimated className="h-14 w-14" />
            </Link>
          </div>
          <Heading dark className="mt-8 text-base/6 font-medium">Welcome to Lucid AI</Heading>
          <Subheading dark className="mt-1 text-sm/5 text-muted-foreground">
            Sign in to access the Internet of AI.
          </Subheading>

          <div className="mt-8 space-y-3">
            <Button
              onClick={handleWalletLogin}
              className="w-full rounded-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Connect a Wallet
            </Button>
            <Button
              onClick={handleGoogleLogin}
              variant="outline"
              className="w-full rounded-full bg-card text-foreground hover:bg-muted"
            >
              <svg className="w-5 h-5 mr-2 inline" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>
            <Button
              onClick={handleEmailLogin}
              variant="outline"
              className="w-full rounded-full bg-card text-foreground hover:bg-muted"
            >
              Continue with Email
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Local login — email/password form via GoTrue. */
function LocalLoginContent() {
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (isAuthenticated) {
      const nativeHandoff = searchParams?.get('native_handoff')
      if (nativeHandoff) {
        fetch(`/api/native/session/handoff/${encodeURIComponent(nativeHandoff)}/complete`, {
          method: 'POST',
          credentials: 'include',
        })
          .then((response) => response.json())
          .then((payload: { redirectUrl?: string }) => {
            window.location.assign(payload.redirectUrl ?? '/dashboard')
          })
          .catch(() => {
            router.push('/dashboard')
          })
        return
      }

      const next = searchParams?.get('next')
      router.push(next && next.startsWith('/') ? next : '/dashboard')
    }
  }, [isAuthenticated, router, searchParams])

  if (isAuthenticated) {
    return (
      <div className="isolate flex items-center justify-center p-6 lg:p-8 relative z-10">
        <div className="w-full max-w-md rounded-xl bg-card/90 backdrop-blur-md shadow-md ring-1 ring-border p-7 sm:p-11">
          <div className="flex items-center justify-center">
            <LogoAnimated className="h-14 w-14" />
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="isolate flex items-center justify-center p-6 lg:p-8 relative z-10">
      <div className="w-full max-w-md rounded-xl bg-card/90 backdrop-blur-md shadow-md ring-1 ring-border">
        <div className="p-7 sm:p-11 text-center">
          <div className="flex items-center justify-center">
            <Link href="/" title="Home">
              <LogoAnimated className="h-14 w-14" />
            </Link>
          </div>
          <Heading dark className="mt-8 text-base/6 font-medium">Welcome to Lucid AI</Heading>
          <Subheading dark className="mt-1 text-sm/5 text-muted-foreground">
            Sign in to your self-hosted instance.
          </Subheading>
          <LocalLoginForm />
        </div>
      </div>
    </div>
  )
}

function MisconfiguredAuthContent() {
  return (
    <div className="isolate flex items-center justify-center p-6 lg:p-8 relative z-10">
      <div className="w-full max-w-md rounded-xl bg-card/90 backdrop-blur-md shadow-md ring-1 ring-border">
        <div className="p-7 sm:p-11 text-center">
          <div className="flex items-center justify-center">
            <Link href="/" title="Home">
              <LogoAnimated className="h-14 w-14" />
            </Link>
          </div>
          <Heading dark className="mt-8 text-base/6 font-medium">Auth Needs Configuration</Heading>
          <Subheading dark className="mt-1 text-sm/5 text-muted-foreground">
            This environment is missing <code className="font-mono">NEXT_PUBLIC_PRIVY_APP_ID</code>, so Privy login cannot start.
          </Subheading>
          <p className="mt-6 text-sm text-muted-foreground">
            Add the public Privy app ID to your local env and restart the dev server.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Login() {
  return (
    <main className="bg-background relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden">
      <InteractiveGridPattern
        squares={[40, 40]}
        className={cn(
          "absolute inset-0",
          "[mask-image:radial-gradient(500px_circle_at_center,white,transparent)]",
          "skew-y-12"
        )}
      />
      {isAuthMisconfigured() ? (
        <MisconfiguredAuthContent />
      ) : isPrivyAuth() ? (
        <PrivyLoginContent />
      ) : (
        <LocalLoginContent />
      )}
    </main>
  )
}
