'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'

/**
 * Local auth login form — email/password via GoTrue.
 * Used when AUTH_PROVIDER=local (self-hosted, no Privy).
 */
export function LocalLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/local-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, mode }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Authentication failed')
        return
      }

      // Redirect to intended destination or dashboard
      const next = searchParams?.get('next')
      router.push(next && next.startsWith('/') ? next : '/dashboard')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          minLength={8}
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={mode === 'signup' ? 'Min 8 characters' : 'Your password'}
        />
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {mode === 'login' ? (
          <>
            No account?{' '}
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null) }}
              className="text-blue-400 hover:text-blue-300"
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null) }}
              className="text-blue-400 hover:text-blue-300"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  )
}
