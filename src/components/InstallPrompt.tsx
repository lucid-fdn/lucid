'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { XMarkIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const { isAuthenticated } = useAuth()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Only show prompt if user is isAuthenticated
      if (isAuthenticated) {
        setShowPrompt(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handler)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [isAuthenticated])

  // Show prompt when user becomes isAuthenticated
  useEffect(() => {
    if (isAuthenticated && deferredPrompt) {
      setShowPrompt(true)
    }
  }, [isAuthenticated, deferredPrompt])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    
    console.log(`PWA install outcome: ${outcome}`)
    
    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    // Remember dismissal
    localStorage.setItem('pwa-prompt-dismissed', 'true')
  }

  // Don't show if not isAuthenticated or user dismissed before
  if (!isAuthenticated || !showPrompt || !deferredPrompt) {
    return null
  }

  // Check if user dismissed before
  if (typeof window !== 'undefined' && localStorage.getItem('pwa-prompt-dismissed')) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-slide-up">
      <div className="rounded-xl bg-white dark:bg-gray-800 p-4 shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <ArrowDownTrayIcon className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Install Lucid Studio
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Get quick access to your AI agents
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Dismiss"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={handleInstall}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors duration-120"
          >
            Install App
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors duration-120"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
