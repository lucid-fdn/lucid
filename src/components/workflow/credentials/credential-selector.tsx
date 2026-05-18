'use client'

/**
 * Credential Selector Component
 * 
 * Allows users to select or connect OAuth credentials for workflow nodes.
 * Integrates with the existing Nango OAuth system via useOAuth hook.
 * 
 * Features:
 * - Shows connected accounts for the required provider
 * - Allows connecting new accounts inline
 * - Displays account info (username, email)
 * - Graceful loading and error states
 * 
 * @example
 * <CredentialSelector
 *   provider="twitter"
 *   selectedCredentialId={node.data.credentialId}
 *   onSelect={(id) => updateNode({ credentialId: id })}
 * />
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useOAuth } from '@/hooks/use-oauth'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CheckCircle2,
  Loader2, 
  Plus, 
  AlertCircle,
  User,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { getNangoLogoUrl } from '@/lib/oauth/utils'
import { getProviderDisplayName } from '@/lib/workflow/credential-mapping'

interface CredentialSelectorProps {
  /** The Nango provider ID (e.g., 'twitter', 'google-sheets') */
  provider: string
  /** Currently selected credential ID */
  selectedCredentialId?: string | null
  /** Callback when a credential is selected */
  onSelect: (credentialId: string | null) => void
  /** Optional: Custom label */
  label?: string
  /** Optional: Whether the field is required */
  required?: boolean
  /** Optional: Disabled state */
  disabled?: boolean
  /** Optional: Show compact version */
  compact?: boolean
}

export function CredentialSelector({
  provider,
  selectedCredentialId,
  onSelect,
  label = 'Account',
  required = true,
  disabled = false,
  compact = false,
}: CredentialSelectorProps) {
  const {
    connections,
    loading,
    error,
    connectProvider,
    syncConnection,
    refreshConnections,
  } = useOAuth()

  const [isConnecting, setIsConnecting] = useState(false)
  const [pendingAutoSelect, setPendingAutoSelect] = useState(false)
  const [_pendingConnectionId, setPendingConnectionId] = useState<string | null>(null) // Store connectionId from initiate for sync
  const previousConnectionCountRef = useRef<number>(0)
  const hasAutoSelectedRef = useRef(false) // CRITICAL: Prevent infinite loop from auto-selecting undefined

  // Filter connections for this specific provider
  const providerConnections = useMemo(() => {
    return connections.filter(conn => conn.provider === provider)
  }, [connections, provider])

  // INDUSTRY STANDARD: Auto-select accounts intelligently
  // - On initial mount: auto-select first available account if nothing selected
  // - After OAuth: auto-select the newly connected account
  // NOTE: We use connectionId (Nango ID) for selection, as it's needed for API calls
  useEffect(() => {
    const currentCount = providerConnections.length
    const previousCount = previousConnectionCountRef.current
    
    // If we were waiting for a connection and a new one appeared, auto-select it
    if (pendingAutoSelect && currentCount > previousCount && currentCount > 0) {
      // Select the newest connection (last in the array)
      const newestConnection = providerConnections[currentCount - 1]
      // GUARD: Only call onSelect if connectionId is valid (not undefined)
      if (newestConnection.connectionId) {
        console.log('[CredentialSelector] ✨ Auto-selecting newly connected account:', newestConnection.connectionId)
        onSelect(newestConnection.connectionId)
        hasAutoSelectedRef.current = true
      }
      setPendingAutoSelect(false)
    }
    // INDUSTRY STANDARD: Auto-select on mount if connections exist but nothing selected
    // This handles: user adds node, already has Twitter connected → auto-use it
    // CRITICAL: Use hasAutoSelectedRef to prevent infinite loops when connectionId is undefined
    else if (!selectedCredentialId && currentCount > 0 && !pendingAutoSelect && !hasAutoSelectedRef.current) {
      // Select the first (or most recent) connection
      const connectionToSelect = providerConnections[0]
      // GUARD: Only call onSelect if connectionId is valid (not undefined)
      // If connectionId is undefined, mark as auto-selected anyway to prevent infinite loop
      hasAutoSelectedRef.current = true
      if (connectionToSelect.connectionId) {
        console.log('[CredentialSelector] ✨ Auto-selecting available account on mount:', connectionToSelect.connectionId)
        onSelect(connectionToSelect.connectionId)
      } else {
        console.warn('[CredentialSelector] ⚠️ Connection found but connectionId is undefined - skipping auto-select')
      }
    }
    
    previousConnectionCountRef.current = currentCount
  }, [providerConnections, pendingAutoSelect, selectedCredentialId, onSelect])

  // Get display name for the provider
  const providerDisplayName = getProviderDisplayName(provider)

  // Handle connecting a new account
  const handleConnect = async () => {
    setIsConnecting(true)
    // Set flag so useEffect will auto-select when new connection appears
    setPendingAutoSelect(true)
    
    try {
      const result = await connectProvider(provider)
      
      // CRITICAL: Store connectionId for sync - this is returned by backend /initiate
      const connectionId = result.connectionId
      setPendingConnectionId(connectionId)
      console.log('[CredentialSelector] 🔑 Got connectionId from initiate:', connectionId)
      
      // Open OAuth popup
      const width = 500
      const height = 600
      const left = (window.screen.width - width) / 2
      const top = (window.screen.height - height) / 2
      
      const popup = window.open(
        result.authUrl,
        `oauth-${provider}`,
        `width=${width},height=${height},left=${left},top=${top},toolbar=0,location=0,menubar=0`
      )
      
      if (!popup) {
        alert('Popup blocked. Please allow popups for this site.')
        setIsConnecting(false)
        setPendingConnectionId(null)
        return
      }
      
      // Poll for popup close and sync connection
      const pollTimer = setInterval(() => {
        try {
          if (!popup || popup.closed) {
            clearInterval(pollTimer)
            console.log('[CredentialSelector] Popup closed, syncing connection')
            
            // Wait for Nango to complete, then sync to our database
            setTimeout(async () => {
              try {
                // CRITICAL: Call sync endpoint with connectionId per backend API
                console.log('[CredentialSelector] 🔄 Calling syncConnection for', provider, 'with connectionId:', connectionId)
                await syncConnection(provider, connectionId)
                console.log('[CredentialSelector] ✅ Connection synced successfully')
                
                // Refresh connections - useEffect will auto-select the new connection
                await refreshConnections()
              } catch (syncError) {
                console.error('[CredentialSelector] ⚠️ Sync failed:', syncError)
                // Still try to refresh UI even if sync fails
                await refreshConnections()
              } finally {
                setIsConnecting(false)
                setPendingConnectionId(null)
              }
            }, 2000) // Wait 2 seconds for Nango to complete
          }
        } catch (_e) {
          // Cross-origin error, popup still open
        }
      }, 500)
      
      // Safety: stop polling after 10 minutes
      setTimeout(() => {
        clearInterval(pollTimer)
        setIsConnecting(false)
        setPendingConnectionId(null)
      }, 600000)
      
    } catch (err) {
      console.error('Failed to connect:', err)
      setIsConnecting(false)
      setPendingConnectionId(null)
    }
  }

  // Get the selected connection details
  // Match by connectionId (Nango ID) or fall back to internal id for backwards compatibility
  const selectedConnection = providerConnections.find(
    conn => conn.connectionId === selectedCredentialId || conn.id === selectedCredentialId
  )

  // Loading state
  if (loading && connections.length === 0) {
    return (
      <div className="space-y-2">
        <Label className="text-xs font-medium">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/50">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading accounts...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-2">
        <Label className="text-xs font-medium">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        <div className="flex items-center gap-2 px-3 py-2 border border-destructive/50 rounded-md bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">Failed to load accounts</span>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={handleConnect}
        >
          <Plus className="h-3 w-3 mr-1" />
          Connect {providerDisplayName}
        </Button>
      </div>
    )
  }

  // No connections for this provider
  if (providerConnections.length === 0) {
    return (
      <div className="space-y-2">
        <Label className="text-xs font-medium">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        <div className="space-y-2">
          <div className="px-3 py-2 border border-dashed rounded-md bg-muted/50">
            <div className="flex items-center gap-2">
              <Image
                src={getNangoLogoUrl(provider)}
                alt={providerDisplayName}
                width={20}
                height={20}
                className="w-5 h-5 object-contain"
                unoptimized
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              <p className="text-sm font-medium text-muted-foreground">
                No {providerDisplayName} account connected
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Connect an account to use this node
            </p>
          </div>
          <Button 
            variant="default" 
            size="sm" 
            className="w-full"
            onClick={handleConnect}
            disabled={isConnecting || disabled}
          >
            {isConnecting ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Plus className="h-3 w-3 mr-1" />
            )}
            Connect {providerDisplayName}
          </Button>
        </div>
      </div>
    )
  }

  // Has connections - show selector
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      
      <Select
        value={selectedCredentialId || ''}
        onValueChange={(value) => onSelect(value || null)}
        disabled={disabled}
      >
        <SelectTrigger className={cn(
          "w-full",
          selectedCredentialId && "border-green-500/50"
        )}>
          <SelectValue placeholder="Select an account">
            {selectedConnection && (
              <div className="flex items-center gap-2">
                {/* Show avatar if available, otherwise provider logo */}
                {selectedConnection.avatarUrl ? (
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={selectedConnection.avatarUrl} alt={selectedConnection.displayName || 'Profile'} />
                    <AvatarFallback className="text-[8px]">
                      {selectedConnection.username?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Image
                    src={getNangoLogoUrl(provider)}
                    alt={providerDisplayName}
                    width={16}
                    height={16}
                    className="w-4 h-4 object-contain"
                    unoptimized
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                )}
                <span className="truncate">
                  {selectedConnection.displayName || selectedConnection.username || selectedConnection.email || 'Connected Account'}
                </span>
                <CheckCircle2 className="h-3 w-3 text-green-600 ml-auto flex-shrink-0" />
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {providerConnections.map((conn) => (
            // Use connectionId (Nango ID) as value for API calls
            // GUARD: Skip connections without connectionId (would cause React errors)
            <SelectItem key={conn.id} value={conn.connectionId || conn.id || `temp-${conn.provider}`}>
              <div className="flex items-center gap-2">
                {/* Avatar - show profile pic if available */}
                <Avatar className="h-5 w-5">
                  {conn.avatarUrl ? (
                    <AvatarImage src={conn.avatarUrl} alt={conn.displayName || conn.username || 'Profile'} />
                  ) : null}
                  <AvatarFallback className="text-[8px] bg-muted">
                    {conn.username?.[0]?.toUpperCase() || conn.email?.[0]?.toUpperCase() || <User className="h-3 w-3" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  {/* Display name or username */}
                  <span className="text-sm">
                    {conn.displayName || (conn.username && `@${conn.username}`) || conn.email || 'Connected Account'}
                  </span>
                  {/* Secondary info (username if displayName is shown) */}
                  {conn.displayName && conn.username && (
                    <span className="text-xs text-muted-foreground">@{conn.username}</span>
                  )}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Add another account button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-xs h-7"
        onClick={handleConnect}
        disabled={isConnecting || disabled}
      >
        {isConnecting ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ) : (
          <Plus className="h-3 w-3 mr-1" />
        )}
        Connect another {providerDisplayName} account
      </Button>

      {/* Selected account indicator */}
      {selectedCredentialId && selectedConnection && !compact && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <CheckCircle2 className="h-3 w-3 text-green-600" />
          <span>
            Using {selectedConnection.username ? `@${selectedConnection.username}` : 'connected account'}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Compact version for inline use
 */
export function CredentialSelectorCompact({
  provider,
  selectedCredentialId,
  onSelect,
  disabled = false,
}: Omit<CredentialSelectorProps, 'label' | 'required' | 'compact'>) {
  return (
    <CredentialSelector
      provider={provider}
      selectedCredentialId={selectedCredentialId}
      onSelect={onSelect}
      disabled={disabled}
      compact={true}
      required={false}
    />
  )
}

export default CredentialSelector
