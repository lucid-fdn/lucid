'use client'

import dynamic from 'next/dynamic'

import { isPrivyAuth } from '@/lib/auth/client-config'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'

const PrivyAuthTestPage = dynamic(() => import('./privy-auth-test'), {
  loading: () => <AuthTestLoading label="Loading wallet auth..." />,
  ssr: false,
})

function AuthTestLoading({ label = 'Loading...' }: { label?: string }) {
  return (
    <main className="bg-background relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden">
      <p className="text-sm text-muted-foreground">{label}</p>
    </main>
  )
}

function LocalAuthTestPage() {
  const { isAuthenticated, login, ready } = useAuth()

  if (!ready) return <AuthTestLoading />

  if (isAuthenticated) {
    return (
      <main className="bg-background relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden">
        <p className="text-sm text-green-500">Authenticated (local auth mode)</p>
      </main>
    )
  }

  return (
    <main className="bg-background relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden">
      <Button onClick={login}>Log In</Button>
    </main>
  )
}

export default function AuthTestClient() {
  if (isPrivyAuth()) {
    return <PrivyAuthTestPage />
  }
  return <LocalAuthTestPage />
}
