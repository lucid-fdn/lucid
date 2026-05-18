'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExternalLink, Loader2, CheckCircle2, Copy } from 'lucide-react'

export function TelegramConnect() {
  const [loading, setLoading] = useState(false)
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleConnect() {
    setLoading(true)
    setError(null)
    setDeepLink(null)

    try {
      const res = await fetch('/api/telegram/link-token', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to generate link')
      }
      const data = await res.json()
      setDeepLink(data.deep_link)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!deepLink) return
    await navigator.clipboard.writeText(deepLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#2AABEE]/10">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#2AABEE]" fill="currentColor">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
          </div>
          <div>
            <CardTitle className="text-base">Telegram</CardTitle>
            <CardDescription>
              Deploy and manage agents directly from Telegram
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!deepLink && (
          <>
            <p className="text-sm text-muted-foreground">
              Connect your Telegram account to launch agents, check your plan, and upgrade — all from within Telegram. No terminal needed.
            </p>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button onClick={handleConnect} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating link...
                </>
              ) : (
                <>
                  Connect Telegram
                  <ExternalLink className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </>
        )}

        {deepLink && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
              Link generated! Expires in 15 minutes.
            </div>

            <p className="text-sm text-muted-foreground">
              Click the button below to open Telegram and connect your account:
            </p>

            <div className="flex gap-2">
              <Button asChild>
                <a href={deepLink} target="_blank" rel="noopener noreferrer">
                  Open in Telegram
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button variant="outline" onClick={handleCopy}>
                {copied ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy link
                  </>
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Or send this link to your phone to open on mobile.
            </p>

            <Button variant="ghost" size="sm" onClick={() => setDeepLink(null)}>
              Generate new link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
