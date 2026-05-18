'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useOAuth } from '@/hooks/use-oauth'

type CallbackStatus = 'loading' | 'success' | 'error'

interface OAuthContext {
  providerId: string
  userId: string
  timestamp: number
  source?: 'management' | 'workflow'
  returnUrl?: string
  nodeType?: string
}

function OAuthCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { refreshConnections } = useOAuth()

  const [status, setStatus] = useState<CallbackStatus>('loading')
  const [message, setMessage] = useState('')
  const [providerName, setProviderName] = useState('')
  const [context, setContext] = useState<OAuthContext | null>(null)

  const notifyOpener = useCallback((payload: Record<string, unknown>) => {
    if (typeof window === 'undefined' || !window.opener || window.opener.closed) {
      return false
    }

    try {
      window.opener.postMessage(
        {
          source: 'lucid-oauth-callback',
          ...payload,
        },
        '*',
      )
      return true
    } catch (error) {
      console.error('[OAuth Callback] Failed to notify opener:', error)
      return false
    }
  }, [])

  useEffect(() => {
    async function processCallback() {
      const startTime = Date.now()

      try {
        if (!searchParams) {
          router.push('/settings/oauth')
          return
        }

        const success = searchParams.get('oauth_success')
        const error = searchParams.get('oauth_error')
        const errorMessage = searchParams.get('message')
        const providerFromQuery = searchParams.get('provider')

        const contextStr = sessionStorage.getItem('oauth_context')
        let parsedContext: OAuthContext | null = null

        if (contextStr) {
          try {
            parsedContext = JSON.parse(contextStr)
            setContext(parsedContext)
          } catch (contextError) {
            console.error('[OAuth Callback] Invalid context:', contextError)
          }
        }

        if (success) {
          setStatus('success')
          setProviderName(success)
          setMessage(`${success} connected successfully!`)

          const openerNotified = notifyOpener({
            success: true,
            provider: success,
          })

          void refreshConnections().catch((refreshError) => {
            console.error('[OAuth Callback] Post-success refresh failed:', refreshError)
          })

          console.log('[OAuth Callback] Success', {
            provider: success,
            openerNotified,
            total_duration_ms: Date.now() - startTime,
          })

          if (openerNotified) {
            setTimeout(() => window.close(), 400)
            return
          }

          const returnUrl = parsedContext?.returnUrl || '/settings/oauth'
          setTimeout(() => {
            router.push(returnUrl)
          }, 2000)
          return
        }

        if (error) {
          const finalErrorMessage = errorMessage || `Connection failed: ${error}`
          setStatus('error')
          setMessage(finalErrorMessage)

          const openerNotified = notifyOpener({
            success: false,
            provider: parsedContext?.providerId || providerFromQuery,
            error,
            errorMessage: finalErrorMessage,
          })

          void refreshConnections().catch((refreshError) => {
            console.error('[OAuth Callback] Post-error refresh failed:', refreshError)
          })

          console.error('[OAuth Callback] Error', {
            error,
            finalErrorMessage,
            openerNotified,
            total_duration_ms: Date.now() - startTime,
          })

          if (openerNotified) {
            setTimeout(() => window.close(), 800)
            return
          }

          const returnUrl = parsedContext?.returnUrl || '/settings/oauth'
          setTimeout(() => {
            router.push(returnUrl)
          }, 5000)
          return
        }

        router.push('/settings/oauth')
      } catch (error) {
        console.error('[OAuth Callback] Processing error:', error)
        setStatus('error')
        setMessage('An unexpected error occurred')

        setTimeout(() => {
          router.push('/settings/oauth')
        }, 3000)
      } finally {
        sessionStorage.removeItem('oauth_context')
      }
    }

    processCallback()
  }, [notifyOpener, refreshConnections, router, searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted/20 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="pt-8 pb-8">
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              {status === 'loading' && <Loader2 className="h-16 w-16 animate-spin text-primary" />}

              {status === 'success' && (
                <div className="relative">
                  <CheckCircle2 className="h-16 w-16 text-green-600" />
                  <div className="absolute inset-0 h-16 w-16 animate-ping rounded-full bg-green-600/20" />
                </div>
              )}

              {status === 'error' && <XCircle className="h-16 w-16 text-destructive" />}
            </div>

            <div className="space-y-2">
              {status === 'loading' && (
                <>
                  <h2 className="text-2xl font-bold">Finalizing Connection</h2>
                  <p className="text-muted-foreground">Processing your OAuth authorization...</p>
                </>
              )}

              {status === 'success' && (
                <>
                  <h2 className="text-2xl font-bold text-green-600">Connection Successful</h2>
                  <p className="text-lg">{message}</p>
                  {context?.nodeType && (
                    <p className="text-sm text-muted-foreground">
                      You can now use {providerName} in your {context.nodeType} nodes
                    </p>
                  )}
                </>
              )}

              {status === 'error' && (
                <>
                  <h2 className="text-2xl font-bold text-destructive">Connection Failed</h2>
                  <p className="text-base">{message}</p>
                </>
              )}
            </div>

            {context && status !== 'loading' && (
              <div className="space-y-1 rounded-lg bg-muted p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Provider:</span>
                  <span className="font-medium">{context.providerId}</span>
                </div>
                {context.source && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Source:</span>
                    <span className="font-medium capitalize">{context.source}</span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-4">
              {status === 'loading' && (
                <p className="animate-pulse text-xs text-muted-foreground">This should only take a moment...</p>
              )}

              {status === 'success' && (
                <p className="text-xs text-muted-foreground">
                  {typeof window !== 'undefined' && window.opener ? 'Closing popup...' : 'Redirecting in 2 seconds...'}
                </p>
              )}

              {status === 'error' && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {typeof window !== 'undefined' && window.opener ? 'Closing popup...' : 'Redirecting in 5 seconds...'}
                  </p>
                  <Button variant="outline" onClick={() => router.push('/settings/oauth')}>
                    Return to OAuth Settings
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <OAuthCallbackContent />
    </Suspense>
  )
}
