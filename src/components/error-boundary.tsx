'use client'

/**
 * Error Boundary Component
 * Catches React errors and displays fallback UI
 * Also reports errors to Sentry
 */

import React, { Component, type ReactNode, type ErrorInfo } from 'react'
import { ErrorService } from '@/lib/errors/error-service'
import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Report to Sentry
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        componentStack: errorInfo.componentStack,
        errorBoundary: true,
      },
    })

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo)
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-destructive/10 p-3">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">
                Something went wrong
              </h1>
              <p className="text-muted-foreground">
                We've been notified and are looking into it. Please try refreshing the page.
              </p>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="rounded-lg bg-muted p-4 text-left">
                <p className="text-sm font-mono text-destructive break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={this.handleReload}
                variant="default"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Page
              </Button>
              <Button
                onClick={this.handleGoHome}
                variant="outline"
                className="gap-2"
              >
                <Home className="h-4 w-4" />
                Go Home
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Error Fallback Component
 * Lightweight fallback for inline errors
 */
export function ErrorFallback({
  error,
  reset,
}: {
  error?: Error
  reset?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-4">
      <div className="rounded-full bg-destructive/10 p-3">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-2 text-center">
        <h3 className="font-semibold">Something went wrong</h3>
        <p className="text-sm text-muted-foreground">
          {error?.message || 'An unexpected error occurred'}
        </p>
      </div>
      {reset && (
        <Button onClick={reset} variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-3 w-3" />
          Try Again
        </Button>
      )}
    </div>
  )
}
