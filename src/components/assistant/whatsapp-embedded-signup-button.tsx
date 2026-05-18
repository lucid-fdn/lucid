'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import type { AgentChannel } from '@/types/agent'

declare global {
  interface Window {
    FB?: {
      init: (config: Record<string, unknown>) => void
      login: (
        callback: (response: {
          authResponse?: { code?: string }
          status?: string
        }) => void,
        options?: Record<string, unknown>,
      ) => void
    }
    fbAsyncInit?: () => void
  }
}

interface EmbeddedSignupPreparation {
  enabled: boolean
  appId?: string
  configId?: string
  error?: string
  details?: string
}

interface EmbeddedSignupSessionInfo {
  phoneNumberId: string | null
  phoneNumber: string | null
  businessAccountId: string | null
}

interface EmbeddedSignupFinalizeResponse {
  channel?: AgentChannel
  webhookUrl?: string
  webhookVerifyToken?: string | null
}

interface WhatsAppEmbeddedSignupButtonProps {
  assistantId: string
  label: string
  busyLabel?: string
  className?: string
  onConnected?: (payload: EmbeddedSignupFinalizeResponse) => void | Promise<void>
}

let facebookSdkPromise: Promise<void> | null = null

function loadFacebookSdk(appId: string): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('WhatsApp Embedded Signup requires a browser environment.'))
  }

  if (window.FB) {
    window.FB.init({
      appId,
      cookie: true,
      xfbml: false,
      version: 'v23.0',
    })
    return Promise.resolve()
  }

  if (facebookSdkPromise) return facebookSdkPromise

  facebookSdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = function fbAsyncInit() {
      try {
        window.FB?.init({
          appId,
          cookie: true,
          xfbml: false,
          version: 'v23.0',
        })
        resolve()
      } catch (error) {
        reject(error)
      }
    }

    const existingScript = document.getElementById('facebook-jssdk')
    if (existingScript) return

    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.async = true
    script.defer = true
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.onerror = () => reject(new Error('Failed to load Facebook SDK'))
    document.body.appendChild(script)
  })

  return facebookSdkPromise
}

function parseEmbeddedSignupMessage(raw: unknown): {
  type?: string
  event?: string
  data?: Record<string, unknown>
} | null {
  try {
    const parsed =
      typeof raw === 'string'
        ? JSON.parse(raw)
        : raw && typeof raw === 'object'
          ? raw
          : null
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as { type?: string; event?: string; data?: Record<string, unknown> }
  } catch {
    return null
  }
}

function readSessionInfo(data: Record<string, unknown> | undefined): EmbeddedSignupSessionInfo {
  const phoneNumberIdCandidates = [
    data?.phone_number_id,
    data?.phoneNumberId,
  ]
  const phoneNumberCandidates = [
    data?.phone_number,
    data?.display_phone_number,
    data?.displayPhoneNumber,
    data?.phoneNumber,
  ]
  const businessAccountIdCandidates = [
    data?.waba_id,
    data?.business_account_id,
    data?.businessAccountId,
    data?.wabaId,
  ]

  const pickString = (values: unknown[]): string | null => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim()
      }
    }
    return null
  }

  return {
    phoneNumberId: pickString(phoneNumberIdCandidates),
    phoneNumber: pickString(phoneNumberCandidates),
    businessAccountId: pickString(businessAccountIdCandidates),
  }
}

export function WhatsAppEmbeddedSignupButton({
  assistantId,
  label,
  busyLabel = 'Connecting...',
  className,
  onConnected,
}: WhatsAppEmbeddedSignupButtonProps) {
  const [isBusy, setIsBusy] = useState(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const runEmbeddedSignup = useCallback(async () => {
    setIsBusy(true)

    try {
      const csrf = getCSRFTokenFromCookie()
      const prepareResponse = await fetch(`/api/assistants/${assistantId}/whatsapp-embedded-signup`, {
        headers: {
          ...(csrf && { 'x-csrf-token': csrf }),
        },
      })
      const preparePayload = (await prepareResponse.json().catch(() => null)) as
        | EmbeddedSignupPreparation
        | null
      if (!prepareResponse.ok || !preparePayload?.enabled || !preparePayload.appId || !preparePayload.configId) {
        throw new Error(
          preparePayload?.details || preparePayload?.error || 'WhatsApp Embedded Signup is not available.',
        )
      }

      await loadFacebookSdk(preparePayload.appId)

      const sessionInfoPromise = new Promise<EmbeddedSignupSessionInfo>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup()
          reject(new Error('Timed out waiting for WhatsApp Embedded Signup session details.'))
        }, 120000)

        const cleanup = () => {
          window.clearTimeout(timeout)
          window.removeEventListener('message', handleMessage)
        }

        const handleMessage = (event: MessageEvent) => {
          if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') {
            return
          }

          const payload = parseEmbeddedSignupMessage(event.data)
          if (!payload || payload.type !== 'WA_EMBEDDED_SIGNUP') return

          if (payload.event === 'FINISH') {
            cleanup()
            resolve(readSessionInfo(payload.data))
            return
          }

          if (payload.event === 'CANCEL') {
            cleanup()
            reject(new Error('WhatsApp Embedded Signup was cancelled.'))
            return
          }

          if (payload.event === 'ERROR') {
            cleanup()
            reject(
              new Error(
                typeof payload.data?.error_message === 'string'
                  ? payload.data.error_message
                  : 'WhatsApp Embedded Signup failed.',
              ),
            )
          }
        }

        window.addEventListener('message', handleMessage)
      })

      const codeResponse = await new Promise<string>((resolve, reject) => {
        window.FB?.login(
          (response) => {
            const code = response.authResponse?.code
            if (typeof code === 'string' && code.trim().length > 0) {
              resolve(code.trim())
              return
            }

            reject(new Error('Meta did not return an authorization code.'))
          },
          {
            config_id: preparePayload.configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              sessionInfoVersion: '3',
              version: 'v3',
            },
          },
        )
      })

      const sessionInfo = await sessionInfoPromise
      if (!sessionInfo.phoneNumberId) {
        throw new Error(
          'Embedded Signup finished, but Meta did not return a phone number ID. Please retry or use manual BYOB setup.',
        )
      }

      const finalizeResponse = await fetch(`/api/assistants/${assistantId}/whatsapp-embedded-signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrf && { 'x-csrf-token': csrf }),
        },
        body: JSON.stringify({
          code: codeResponse,
          phoneNumberId: sessionInfo.phoneNumberId,
          phoneNumber: sessionInfo.phoneNumber,
          businessAccountId: sessionInfo.businessAccountId,
        }),
      })

      const finalizePayload = (await finalizeResponse.json().catch(() => null)) as
        | ({ error?: string } & EmbeddedSignupFinalizeResponse)
        | null
      if (!finalizeResponse.ok) {
        throw new Error(finalizePayload?.error || 'Failed to finalize WhatsApp Embedded Signup.')
      }

      toast.success('WhatsApp connected via Meta Embedded Signup')
      await onConnected?.(finalizePayload ?? {})
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'WhatsApp Embedded Signup failed.',
      )
    } finally {
      if (isMountedRef.current) {
        setIsBusy(false)
      }
    }
  }, [assistantId, onConnected])

  return (
    <button
      type="button"
      onClick={() => void runEmbeddedSignup()}
      disabled={isBusy}
      className={className}
    >
      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {isBusy ? busyLabel : label}
    </button>
  )
}
