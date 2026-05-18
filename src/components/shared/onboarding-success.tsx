'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/ui/components/alert'
import { Check, Sparkles, ArrowRight, Info } from 'lucide-react'
import confetti from 'canvas-confetti'

export interface SummaryItem {
  label: string
  description?: string
  badges?: string[]
}

interface OnboardingSuccessProps {
  type: 'workspace' | 'profile'
  title: string
  subtitle?: string
  summaryItems: SummaryItem[]
  redirectUrl: string
  redirectLabel: string
  tips?: string[]
  showPlanInfo?: boolean
  autoRedirectSeconds?: number
}

function renderInlineTip(tip: string) {
  const parts: React.ReactNode[] = []
  const kbdPattern = /<kbd(?:\s+class="[^"]*")?>(.*?)<\/kbd>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = kbdPattern.exec(tip)) != null) {
    if (match.index > lastIndex) {
      parts.push(tip.slice(lastIndex, match.index))
    }
    parts.push(
      <kbd key={`${match.index}-${match[1]}`} className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {match[1]}
      </kbd>,
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < tip.length) {
    parts.push(tip.slice(lastIndex))
  }

  return parts
}

export function OnboardingSuccess({
  type: _type,
  title,
  subtitle,
  summaryItems,
  redirectUrl,
  redirectLabel,
  tips,
  showPlanInfo = true,
  autoRedirectSeconds = 10,
}: OnboardingSuccessProps) {
  const router = useRouter()
  const [countdown, setCountdown] = useState(autoRedirectSeconds)
  const [autoRedirect, setAutoRedirect] = useState(true)

  // Trigger confetti on mount
  useEffect(() => {
    const duration = 3 * 1000
    const animationEnd = Date.now() + duration
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 }

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min
    }

    const interval: ReturnType<typeof setInterval> = setInterval(function() {
      const timeLeft = animationEnd - Date.now()

      if (timeLeft <= 0) {
        return clearInterval(interval)
      }

      const particleCount = 50 * (timeLeft / duration)
      
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      })
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      })
    }, 250)

    return () => clearInterval(interval)
  }, [])

  const handleContinue = useCallback(() => {
    console.log(`[OnboardingSuccess] Redirecting to: ${redirectUrl}`)
    router.push(redirectUrl)
  }, [redirectUrl, router])

  // Countdown timer
  useEffect(() => {
    if (!autoRedirect || countdown <= 0) return

    const timer = setTimeout(() => {
      if (countdown === 1) {
        handleContinue()
      } else {
        setCountdown(countdown - 1)
      }
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown, autoRedirect, handleContinue])

  const handleSkipCountdown = () => {
    setAutoRedirect(false)
  }

  return (
    <div className="space-y-8 text-center">
      {/* Success Icon */}
      <div className="flex justify-center">
        <div className="relative">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 animate-pulse">
            <Check className="h-12 w-12 text-primary" />
          </div>
          <Sparkles className="absolute -top-2 -right-2 h-8 w-8 text-primary animate-bounce" />
        </div>
      </div>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-muted-foreground text-lg">
            <span className="font-semibold text-foreground">{subtitle}</span>
          </p>
        )}
      </div>

      {/* Summary Card */}
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-6 space-y-6">
          <h3 className="font-semibold text-lg">What's set up for you</h3>
          
          <div className="grid gap-4 text-left">
            {summaryItems.map((item, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <div className="space-y-1 flex-1">
                  <p className="font-medium">{item.label}</p>
                  {item.description && (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                  {item.badges && item.badges.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {item.badges.map((badge, i) => (
                        <Badge key={i} variant="secondary">
                          {badge}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Plan Info Banner */}
      {showPlanInfo && (
        <Alert className="max-w-2xl mx-auto">
          <Info className="h-4 w-4" />
          <AlertDescription>
            You're starting with the <strong>Free plan</strong> (3 members, 1 project, 5GB storage).{' '}
            <Link 
              href="/pricing" 
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-4 hover:text-primary transition-colors duration-120"
            >
              View all plans →
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Tips */}
      {tips && tips.length > 0 && (
        <div className="max-w-2xl mx-auto">
          <h3 className="font-semibold mb-4">Quick tips to get started</h3>
          <div className="grid gap-3 text-left text-sm">
            {tips.map((tip, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span>{renderInlineTip(tip)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto-redirect countdown */}
      {autoRedirect && countdown > 0 && (
        <p className="text-sm text-muted-foreground">
          Redirecting in {countdown} seconds...{' '}
          <button
            onClick={handleSkipCountdown}
            className="underline hover:text-foreground"
          >
            cancel
          </button>
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4">
        <Button
          size="lg"
          onClick={handleContinue}
          className="min-w-[200px]"
        >
          {redirectLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
