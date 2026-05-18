/**
 * OAuth Management Component (Unified & Reusable)
 * 
 * Flexible OAuth management component that works in both full-page and modal contexts.
 * Supports two display modes: 'full' and 'compact'.
 * 
 * Features:
 * - Connect/disconnect providers
 * - Search & filter
 * - Connection stats
 * - Tabs (full mode only)
 * - Category filter (full mode only)
 * - Responsive design
 * 
 * Usage:
 *   // Full page mode
 *   <OAuthManagement mode="full" />
 * 
 *   // Modal/compact mode
 *   <OAuthManagement mode="compact" />
 */

'use client'

import { useOAuth } from '@/hooks/use-oauth'
import type { OAuthProviderInfo, OAuthConnection } from '@/lib/oauth'
import { useAuth } from '@/contexts/auth-context'
import { isLocalAuth } from '@/lib/auth/client-config'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/radix-tabs'
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Plus, 
  Search,
  ExternalLink,
  AlertCircle,
  TrendingUp
} from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getNangoLogoUrl } from '@/lib/oauth/utils'

/**
 * Provider Card Component
 */
function ProviderCard({
  provider,
  isConnected,
  connection,
  onConnect,
  onDisconnect,
  loading,
  mode = 'full',
}: {
  provider: OAuthProviderInfo
  isConnected: boolean
  connection?: OAuthConnection
  onConnect: () => void
  onDisconnect: () => void
  loading: boolean
  mode?: 'full' | 'compact'
}) {
  if (mode === 'compact') {
    // Compact card for modals
    return (
      <Card className={isConnected ? 'border-green-200 dark:border-green-900' : ''}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            {/* Provider Info */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Avatar or Provider Logo */}
              <div className="w-12 h-12 flex items-center justify-center flex-shrink-0 rounded-full overflow-hidden bg-muted">
                {connection?.avatarUrl ? (
                  <Image
                    src={connection.avatarUrl}
                    alt={connection.displayName || connection.username || `${provider.name} profile`}
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                    unoptimized
                    onError={(e) => {
                      // Fallback to provider logo if avatar fails
                      e.currentTarget.style.display = 'none'
                      e.currentTarget.nextElementSibling?.classList.remove('hidden')
                    }}
                  />
                ) : null}
                <Image
                  src={getNangoLogoUrl(provider.id)}
                  alt={`${provider.name} logo`}
                  width={40}
                  height={40}
                  className={`w-10 h-10 object-contain ${connection?.avatarUrl ? 'hidden' : ''}`}
                  unoptimized
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.nextElementSibling?.classList.remove('hidden')
                  }}
                />
                <span className="hidden text-2xl">🔗</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-sm truncate">{provider.name}</h4>
                  {isConnected && (
                    <Badge variant="default" className="bg-green-600 h-5 text-xs">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </div>
                {/* Show displayName or username */}
                {(connection?.displayName || connection?.username) && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {connection.displayName || `@${connection.username}`}
                    {connection.displayName && connection.username && (
                      <span className="opacity-60"> (@{connection.username})</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {isConnected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDisconnect}
                  disabled={loading}
                  className="text-xs h-8"
                >
                  {loading ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : null}
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={onConnect}
                  disabled={loading}
                  className="text-xs h-8"
                >
                  {loading ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Plus className="w-3 h-3 mr-1" />
                  )}
                  Connect
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Full card for pages
  return (
    <Card className={isConnected ? 'border-green-200 dark:border-green-900' : ''}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Avatar or Provider Logo */}
            <div className="w-12 h-12 flex items-center justify-center flex-shrink-0 rounded-lg overflow-hidden bg-muted">
              {connection?.avatarUrl ? (
                <Image
                  src={connection.avatarUrl}
                  alt={connection.displayName || connection.username || `${provider.name} profile`}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                  unoptimized
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.nextElementSibling?.classList.remove('hidden')
                  }}
                />
              ) : null}
              <Image
                src={getNangoLogoUrl(provider.id)}
                alt={`${provider.name} logo`}
                width={32}
                height={32}
                className={`w-8 h-8 object-contain ${connection?.avatarUrl ? 'hidden' : ''}`}
                unoptimized
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.nextElementSibling?.classList.remove('hidden')
                }}
              />
              <span className="hidden text-3xl">🔗</span>
            </div>
            <div>
              <h3 className="font-semibold text-lg">{provider.name}</h3>
              <p className="text-sm text-muted-foreground">{provider.description}</p>
            </div>
          </div>
          {isConnected && (
            <Badge variant="default" className="bg-green-600">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>

        {connection && (
          <div className="mb-4 p-3 bg-muted rounded-md">
            {/* Show displayName and/or username */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Account:</span>
              <span className="font-medium">
                {connection.displayName || (connection.username && `@${connection.username}`) || connection.email || 'Connected'}
              </span>
            </div>
            {/* If displayName exists, show username separately */}
            {connection.displayName && connection.username && (
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-muted-foreground">Username:</span>
                <span className="font-medium">@{connection.username}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Connected:</span>
              <span className="font-medium">
                {new Date(connection.connectedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {isConnected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onConnect}
                disabled={loading}
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Add Another
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={onDisconnect}
                disabled={loading}
                className="flex-1"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={onConnect}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Connect {provider.name}
            </Button>
          )}
        </div>

        {provider.requiredScopes && provider.requiredScopes.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-2">Required Permissions:</p>
            <div className="flex flex-wrap gap-1">
              {provider.requiredScopes.slice(0, 3).map((scope: string) => (
                <Badge key={scope} variant="secondary" className="text-xs">
                  {scope.split('/').pop() || scope}
                </Badge>
              ))}
              {provider.requiredScopes.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{provider.requiredScopes.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * OAuth Management Component (Unified)
 */
export function OAuthManagement({ 
  mode = 'full',
  showHeader = true,
  showStats = true,
  showHelp = true,
}: {
  mode?: 'full' | 'compact'
  showHeader?: boolean
  showStats?: boolean
  showHelp?: boolean
}) {
  const { isAuthenticated: authenticated, login } = useAuth()
  const {
    providers,
    connections,
    loading,
    error,
    connectProvider,
    disconnectProvider,
    refreshConnections,
    syncConnection,
    isConnected,
    isProviderLoading,
  } = useOAuth()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Component mount logging
  useEffect(() => {
    const stack = new Error().stack
    console.log('[OAuthManagement] 🟢 COMPONENT MOUNTED', {
      mode,
      authenticated,
      timestamp: new Date().toISOString(),
      providersCount: providers.length,
      connectionsCount: connections.length,
      callStack: stack?.split('\n').slice(1, 5).join('\n')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only initialization
  }, []) // Empty deps = mount only

  // Filter providers by search and category
  const filteredProviders = useMemo(() => {
    return providers.filter((provider) => {
      const matchesSearch =
        provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        provider.description?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesCategory =
        mode === 'compact' || selectedCategory === 'all' || provider.category === selectedCategory

      return matchesSearch && matchesCategory
    })
  }, [providers, searchQuery, selectedCategory, mode])

  // Get unique categories (full mode only)
  const categories = useMemo(() => {
    if (mode === 'compact') return []
    const cats = new Set(providers.map((p) => p.category))
    return ['all', ...Array.from(cats)]
  }, [providers, mode])

  // Stats
  const stats = useMemo(() => {
    return {
      totalProviders: providers.length,
      connectedProviders: connections.length,
      availableProviders: providers.length - connections.length,
    }
  }, [providers, connections])

  // OAuth integrations require Privy — not available in local auth mode
  if (isLocalAuth()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>OAuth Integrations</CardTitle>
          <CardDescription>
            OAuth integrations require Privy authentication and are not available in local auth mode.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Handle connect - works with self-hosted Nango
  const handleConnect = async (providerId: string) => {
    try {
      console.log('[OAuth Management] Starting connection for', providerId)
      
      // Get OAuth URL from backend - result includes connectionId
      const result = await connectProvider(providerId)
      
      // CRITICAL: Store connectionId for sync - this is returned by backend /initiate
      const connectionId = result.connectionId
      console.log('[OAuth Management] 🔑 Got connectionId from initiate:', connectionId)
      console.log('[OAuth Management] OAuth URL received, opening popup')
      
      // Calculate centered popup position
      const width = 500
      const height = 600
      const left = (window.screen.width - width) / 2
      const top = (window.screen.height - height) / 2
      
      // Open OAuth in popup
      const popup = window.open(
        result.authUrl,
        `oauth-${providerId}`,
        `width=${width},height=${height},left=${left},top=${top},toolbar=0,location=0,menubar=0`
      )
      
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        // Popup blocked - show helpful message
        const allowPopups = confirm(
          '⚠️ Popup blocked by your browser!\n\n' +
          'To connect OAuth accounts:\n' +
          '1. Click the popup icon in your address bar\n' +
          '2. Select "Always allow popups from this site"\n' +
          '3. Click OK to try again'
        )
        
        if (allowPopups) {
          // Retry
          handleConnect(providerId)
        }
        return
      }
      
      console.log('[OAuth Management] ✅ Popup opened successfully')
      
      // Poll for popup closure to sync and refresh connections
      const pollTimer = setInterval(() => {
        try {
          if (!popup || popup.closed) {
            clearInterval(pollTimer)
            console.log('[OAuth Management] Popup closed, syncing connection to database')
            
            // Wait for Nango to complete, then sync to our database
            setTimeout(async () => {
              try {
                // CRITICAL: Call sync endpoint WITH connectionId to persist connection in database
                // connectionId is required by backend to identify which Nango connection to sync
                console.log('[OAuth Management] 🔄 Calling syncConnection for', providerId, 'with connectionId:', connectionId)
                await syncConnection(providerId, connectionId)
                console.log('[OAuth Management] ✅ Connection synced successfully for', providerId)
              } catch (syncError) {
                console.error('[OAuth Management] ⚠️ Sync failed, still refreshing UI:', syncError)
                // Even if sync fails, try to refresh UI
                await refreshConnections()
              }
            }, 2000) // Wait 2 seconds for Nango to complete
          }
        } catch (_e) {
          // Cross-origin error, popup still open
        }
      }, 500)
      
      // Safety: stop polling after 10 minutes
      setTimeout(() => clearInterval(pollTimer), 600000)
      
    } catch (error) {
      console.error('[OAuth Management] ❌ Failed to connect:', error)
      alert('Failed to connect. Please try again.')
    }
  }

  // Handle disconnect
  // Per API doc: Always pass connectionId when disconnecting a specific account
  const handleDisconnect = async (providerId: string, connectionId?: string) => {
    if (confirm('Are you sure you want to disconnect this account?')) {
      try {
        console.log('[OAuth Management] 🔴 Disconnecting provider:', providerId, 'connectionId:', connectionId || '(not provided)')
        await disconnectProvider(providerId, connectionId)
        console.log('[OAuth Management] ✅ Successfully disconnected:', providerId)
      } catch (error) {
        console.error('[OAuth Management] ❌ Failed to disconnect:', error)
      }
    }
  }

  // Not authenticated
  if (!authenticated) {
    return (
      <div className={mode === 'full' ? 'container max-w-4xl py-8' : 'space-y-4'}>
        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>
              You must be logged in to manage your integrations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={login}>Login</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const content = (
    <>
      {/* Header */}
      {showHeader && mode === 'full' && (
        <div>
          <h1 className="text-3xl font-bold">Integrations</h1>
          <p className="text-muted-foreground mt-2">
            Connect your accounts to enable automated workflows
          </p>
        </div>
      )}

      {showHeader && mode === 'compact' && (
        <div>
          <h3 className="text-lg font-semibold">Integrations</h3>
          <p className="text-sm text-muted-foreground">
            Connect your accounts to enable workflow integrations
          </p>
        </div>
      )}

      {/* Stats */}
      {showStats && (
        <div className={mode === 'full' ? 'grid gap-4 md:grid-cols-3' : 'grid grid-cols-2 gap-4'}>
          {mode === 'full' ? (
            <>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Providers</p>
                      <p className="text-2xl font-bold">{stats.totalProviders}</p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Connected</p>
                      <p className="text-2xl font-bold text-green-600">
                        {stats.connectedProviders}
                      </p>
                    </div>
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Available</p>
                      <p className="text-2xl font-bold">{stats.availableProviders}</p>
                    </div>
                    <Plus className="w-8 h-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Connected</p>
                    <p className="text-2xl font-bold text-green-600">
                      {connections.length}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Available</p>
                    <p className="text-2xl font-bold">{providers.length}</p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className={mode === 'full' ? 'border-destructive' : 'border-destructive bg-destructive/10'}>
          <CardContent className={mode === 'full' ? 'pt-6' : 'p-4'}>
            <div className={`flex items-center gap-2 text-destructive ${mode === 'compact' ? 'text-sm' : ''}`}>
              <AlertCircle className={mode === 'full' ? 'w-5 h-5' : 'w-4 h-4'} />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filter */}
      {mode === 'full' ? (
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search providers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 border rounded-md bg-background"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search providers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Providers List */}
      {mode === 'full' ? (
        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">
              All Providers ({filteredProviders.length})
            </TabsTrigger>
            <TabsTrigger value="connected">
              Connected ({connections.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4 mt-6">
            {loading && providers.length === 0 ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredProviders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No providers found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredProviders.map((provider) => {
                  const connection = connections.find((c) => c.provider === provider.id)
                  return (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      isConnected={isConnected(provider.id)}
                      connection={connection}
                      onConnect={() => handleConnect(provider.id)}
                      onDisconnect={() => handleDisconnect(provider.id, connection?.connectionId)}
                      loading={isProviderLoading(provider.id)}
                      mode={mode}
                    />
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="connected" className="space-y-4 mt-6">
            {connections.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center space-y-4">
                  <XCircle className="w-12 h-12 mx-auto text-muted-foreground" />
                  <div>
                    <p className="font-medium">No connections yet</p>
                    <p className="text-sm text-muted-foreground">
                      Connect your first OAuth account to get started
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {connections.map((connection) => {
                  const provider = providers.find((p) => p.id === connection.provider)
                  if (!provider) return null
                  return (
                    <ProviderCard
                      key={connection.id}
                      provider={provider}
                      isConnected={true}
                      connection={connection}
                      onConnect={() => handleConnect(provider.id)}
                      onDisconnect={() => handleDisconnect(provider.id, connection.connectionId)}
                      loading={isProviderLoading(provider.id)}
                      mode={mode}
                    />
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
          {loading && providers.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No providers found</p>
            </div>
          ) : (
            filteredProviders.map((provider) => {
              const connection = connections.find((c) => c.provider === provider.id)
              return (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  isConnected={isConnected(provider.id)}
                  connection={connection}
                  onConnect={() => handleConnect(provider.id)}
                  onDisconnect={() => handleDisconnect(provider.id, connection?.connectionId)}
                  loading={isProviderLoading(provider.id)}
                  mode={mode}
                />
              )
            })
          )}
        </div>
      )}

      {/* Help */}
      {showHelp && (
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className={mode === 'full' ? 'pt-6' : 'p-4'}>
            <div className="flex items-start gap-3">
              <AlertCircle className={mode === 'full' ? 'w-5 h-5 text-blue-600 mt-0.5' : 'w-4 h-4 text-blue-600 mt-0.5'} />
              <div className={`flex-1 ${mode === 'compact' ? 'text-xs' : ''}`}>
                <p className={`font-medium text-blue-900 dark:text-blue-100 ${mode === 'compact' ? 'mb-1' : ''}`}>
                  {mode === 'full' ? 'How Integrations Work' : 'About Integrations'}
                </p>
                <ul className={`text-blue-700 dark:text-blue-300 ${mode === 'compact' ? 'space-y-0.5 list-disc list-inside' : 'text-sm space-y-1'}`}>
                  <li>OAuth tokens are securely encrypted{mode === 'compact' ? '' : ' and stored'}</li>
                  <li>{mode === 'compact' ? 'Automatically refreshed when needed' : 'Tokens are automatically refreshed when needed'}</li>
                  {mode === 'full' && <li>• You can connect multiple accounts for the same provider</li>}
                  <li>{mode === 'compact' ? 'Required for workflow nodes' : 'Disconnect anytime to revoke access'}</li>
                </ul>
                {mode === 'full' && (
                  <Link
                    href="/docs/oauth"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-2"
                  >
                    Learn more about OAuth
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* View All Link (compact mode only)
      {mode === 'compact' && (
        <div className="text-center pt-2">
          <a
            href="/settings/oauth"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            View full OAuth management page
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )} */}
    </>
  )

  return mode === 'full' ? (
    <div className="container max-w-7xl py-8 space-y-8">
      {content}
    </div>
  ) : (
    <div className="space-y-4">
      {content}
    </div>
  )
}
