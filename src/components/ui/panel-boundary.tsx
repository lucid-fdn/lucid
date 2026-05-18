'use client'

/**
 * PanelBoundary — Section-level error boundary with compact inline fallback.
 *
 * Wraps individual panels/sections so a crash in one widget
 * doesn't take down the entire page. Uses the existing ErrorService
 * for Sentry reporting.
 *
 * Usage:
 *   <PanelBoundary name="introspection-stream">
 *     <ConsciousnessStream />
 *   </PanelBoundary>
 */

import React, { Component, type ReactNode, type ErrorInfo } from 'react'
import { ErrorService } from '@/lib/errors/error-service'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PanelBoundaryProps {
  children: ReactNode
  /** Human-readable section name for error reporting */
  name: string
  /** Optional compact fallback override */
  fallback?: ReactNode
}

interface PanelBoundaryState {
  hasError: boolean
  error: Error | null
  retryKey: number
}

export class PanelBoundary extends Component<PanelBoundaryProps, PanelBoundaryState> {
  constructor(props: PanelBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, retryKey: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<PanelBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        panelName: this.props.name,
        componentStack: errorInfo.componentStack,
        panelBoundary: true,
      },
    })
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryKey: prev.retryKey + 1,
    }))
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 p-6 text-center">
          <AlertTriangle className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            This section failed to load
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="max-w-full overflow-auto text-xs text-destructive">
              {this.state.error.message}
            </pre>
          )}
          <Button
            onClick={this.handleRetry}
            variant="outline"
            size="sm"
            className="mt-1 gap-1.5"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        </div>
      )
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>
  }
}
