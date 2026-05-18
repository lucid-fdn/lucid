'use client'

/**
 * Provider Keys (BYOK) Client — Apple/Vercel-grade UI
 *
 * Manage your own provider API keys for direct inference.
 * Each provider can have one active key at a time (replace strategy).
 *
 * Design: matches gateway-keys-client.tsx patterns.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MoreVertical,
  Plus,
  Power,
  PowerOff,
  Trash2,
  XCircle,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { notificationCopy } from '@/lib/notifications/copy'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProviderKey {
  id: string
  org_id: string
  provider: string
  key_name: string | null
  key_preview: string
  is_active: boolean
  last_verified_at: string | null
  last_used_at: string | null
  verification_status: 'pending' | 'valid' | 'invalid' | 'expired'
  created_by: string | null
  created_at: string
  updated_at: string
}

interface ProviderKeysClientProps {
  orgId: string
}

// ─── Provider metadata ──────────────────────────────────────────────────────

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', color: 'bg-emerald-500' },
  { value: 'anthropic', label: 'Anthropic', color: 'bg-orange-500' },
  { value: 'google', label: 'Google AI', color: 'bg-blue-500' },
  { value: 'mistral', label: 'Mistral', color: 'bg-indigo-500' },
  { value: 'groq', label: 'Groq', color: 'bg-purple-500' },
  { value: 'cohere', label: 'Cohere', color: 'bg-rose-500' },
  { value: 'perplexity', label: 'Perplexity', color: 'bg-cyan-500' },
  { value: 'deepseek', label: 'DeepSeek', color: 'bg-sky-500' },
  { value: 'together', label: 'Together AI', color: 'bg-amber-500' },
  { value: 'fireworks', label: 'Fireworks', color: 'bg-red-500' },
  { value: 'openrouter', label: 'OpenRouter', color: 'bg-violet-500' },
] as const

function getProviderMeta(provider: string) {
  return PROVIDERS.find((p) => p.value === provider) ?? { value: provider, label: provider, color: 'bg-zinc-500' }
}

// ─── Animations ─────────────────────────────────────────────────────────────

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const },
}

const stagger = {
  animate: { transition: { staggerChildren: 0.04 } },
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function verificationBadge(status: string) {
  switch (status) {
    case 'valid':
      return { icon: CheckCircle2, text: 'Verified', cls: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/20 bg-emerald-500/10' }
    case 'invalid':
      return { icon: XCircle, text: 'Invalid', cls: 'text-red-600 dark:text-red-400 border-red-500/20 bg-red-500/10' }
    case 'expired':
      return { icon: XCircle, text: 'Expired', cls: 'text-amber-600 dark:text-amber-400 border-amber-500/20 bg-amber-500/10' }
    default:
      return { icon: Clock, text: 'Pending', cls: 'text-zinc-500 dark:text-zinc-400 border-zinc-500/20 bg-zinc-500/10' }
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ProviderKeysClient({ orgId }: ProviderKeysClientProps) {
  const [keys, setKeys] = useState<ProviderKey[]>([])
  const [loading, setLoading] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<ProviderKey | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Add form
  const [selectedProvider, setSelectedProvider] = useState('')
  const [keyName, setKeyName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const getCSRFHeaders = useCallback(async (): Promise<Record<string, string>> => {
    let token = getCSRFTokenFromCookie()
    if (!token) {
      await fetch('/api/auth/csrf').catch(() => null)
      token = getCSRFTokenFromCookie()
    }
    return token ? { 'x-csrf-token': token } : {}
  }, [])

  // ── Derived ─────────────────────────────────────────────────────────────

  const activeKeys = useMemo(() => keys.filter((k) => k.is_active), [keys])
  const inactiveKeys = useMemo(() => keys.filter((k) => !k.is_active), [keys])
  const configuredProviders = useMemo(
    () => new Set(activeKeys.map((k) => k.provider)),
    [activeKeys],
  )
  const availableProviders = useMemo(
    () => PROVIDERS.filter((p) => !configuredProviders.has(p.value)),
    [configuredProviders],
  )

  // ── Loaders ─────────────────────────────────────────────────────────────

  const loadKeys = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/orgs/${orgId}/provider-keys`)
      if (!res.ok) throw new Error('Failed to load provider keys')
      const data = await res.json()
      setKeys(data.keys || [])
    } catch (error) {
      toastRef.current.error(
        'Error',
        error instanceof Error ? error.message : 'Failed to load provider keys',
      )
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    loadKeys()
  }, [loadKeys])

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleAddKey = async () => {
    if (!selectedProvider || !apiKey.trim()) return
    try {
      setSubmitting(true)
      const res = await fetch(`/api/orgs/${orgId}/provider-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getCSRFHeaders()) },
        body: JSON.stringify({
          provider: selectedProvider,
          key: apiKey.trim(),
          keyName: keyName.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add key')
      }

      setAddDialogOpen(false)
      setSelectedProvider('')
      setKeyName('')
      setApiKey('')
      setShowKey(false)
      await loadKeys()
      toast.success(
        'Key added',
        `${getProviderMeta(selectedProvider).label} API key configured.`,
      )
    } catch (error) {
      toast.error(
        notificationCopy.title.error,
        error instanceof Error ? error.message : 'Failed to add key',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteKey = async () => {
    if (!keyToDelete) return
    try {
      setDeleting(true)
      const res = await fetch(
        `/api/orgs/${orgId}/provider-keys/${keyToDelete.id}`,
        { method: 'DELETE', headers: await getCSRFHeaders() },
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete key')
      }
      setDeleteDialogOpen(false)
      setKeyToDelete(null)
      await loadKeys()
      toast.success('Key deleted', 'Provider key removed.')
    } catch (error) {
      toast.error(
        notificationCopy.title.error,
        error instanceof Error ? error.message : 'Failed to delete key',
      )
    } finally {
      setDeleting(false)
    }
  }

  const handleToggleKey = async (key: ProviderKey) => {
    try {
      setTogglingId(key.id)
      const res = await fetch(`/api/orgs/${orgId}/provider-keys/${key.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await getCSRFHeaders()) },
        body: JSON.stringify({ isActive: !key.is_active }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update key')
      }
      await loadKeys()
      toast.success(
        key.is_active ? 'Key deactivated' : 'Key activated',
        `${getProviderMeta(key.provider).label} key ${key.is_active ? 'deactivated' : 'activated'}.`,
      )
    } catch (error) {
      toast.error(
        notificationCopy.title.error,
        error instanceof Error ? error.message : 'Failed to update key',
      )
    } finally {
      setTogglingId(null)
    }
  }

  // ── Loading State ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading provider keys…
          </p>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Your Provider Keys (BYOK)</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Add your own API keys for direct provider access. One active key per
            provider.
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedProvider('')
            setKeyName('')
            setApiKey('')
            setShowKey(false)
            setAddDialogOpen(true)
          }}
          size="sm"
          className="gap-1.5"
          disabled={availableProviders.length === 0}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Key
        </Button>
      </div>

      {/* Providers grid */}
      {keys.length === 0 ? (
        <motion.div {...fadeIn}>
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 rounded-full bg-muted p-4">
                <KeyRound className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No provider keys yet</h3>
              <p className="mt-1.5 max-w-sm text-center text-sm text-muted-foreground">
                Add your own API keys from OpenAI, Anthropic, Google, and more
                to use them for inference through LucidGateway.
              </p>
              <Button
                onClick={() => setAddDialogOpen(true)}
                className="mt-6 gap-1.5"
                size="sm"
              >
                <Plus className="h-3.5 w-3.5" />
                Add your first key
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          {activeKeys.length > 0 && (
            <motion.div
              variants={stagger}
              initial="initial"
              animate="animate"
              className="space-y-2"
            >
              <h4 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Active Keys ({activeKeys.length})
              </h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {activeKeys.map((key) => (
                  <ProviderKeyCard
                    key={key.id}
                    providerKey={key}
                    toggling={togglingId === key.id}
                    onToggle={() => handleToggleKey(key)}
                    onDelete={() => {
                      setKeyToDelete(key)
                      setDeleteDialogOpen(true)
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {inactiveKeys.length > 0 && (
            <div className="space-y-2">
              <h4 className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Inactive Keys ({inactiveKeys.length})
              </h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {inactiveKeys.map((key) => (
                  <ProviderKeyCard
                    key={key.id}
                    providerKey={key}
                    toggling={togglingId === key.id}
                    onToggle={() => handleToggleKey(key)}
                    onDelete={() => {
                      setKeyToDelete(key)
                      setDeleteDialogOpen(true)
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Unconfigured providers hint */}
          {availableProviders.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Available providers:
              </span>
              {availableProviders.map((p) => (
                <button
                  key={p.value}
                  onClick={() => {
                    setSelectedProvider(p.value)
                    setKeyName('')
                    setApiKey('')
                    setShowKey(false)
                    setAddDialogOpen(true)
                  }}
                  className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-[11px] font-medium transition-colors hover:bg-accent"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${p.color}`}
                  />
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ADD KEY DIALOG                                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Add Provider Key
            </DialogTitle>
            <DialogDescription>
              Your key is encrypted with AES-256-GCM before storage. We never
              log or display your full key.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Provider <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedProvider}
                onValueChange={setSelectedProvider}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => {
                    const isConfigured = configuredProviders.has(p.value)
                    return (
                      <SelectItem key={p.value} value={p.value}>
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${p.color}`}
                          />
                          {p.label}
                          {isConfigured && (
                            <span className="text-[10px] text-muted-foreground">
                              (will replace)
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {selectedProvider && configuredProviders.has(selectedProvider) && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Adding a new key will deactivate the existing{' '}
                  {getProviderMeta(selectedProvider).label} key.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Key Name
              </Label>
              <Input
                placeholder={`e.g. Production ${selectedProvider ? getProviderMeta(selectedProvider).label : ''} Key`}
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                API Key <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder={
                    selectedProvider === 'openai'
                      ? 'sk-...'
                      : selectedProvider === 'anthropic'
                        ? 'sk-ant-...'
                        : 'Paste your API key'
                  }
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-9 pr-10 font-mono text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-9 w-9 p-0"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Encrypted at rest with AES-256-GCM. Only a preview is stored for
                display.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddKey}
              disabled={!selectedProvider || !apiKey.trim() || submitting}
            >
              {submitting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Add Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DELETE CONFIRMATION                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Delete Provider Key
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the{' '}
              <span className="font-medium text-foreground">
                {keyToDelete
                  ? getProviderMeta(keyToDelete.provider).label
                  : ''}
              </span>{' '}
              key{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
                {keyToDelete?.key_preview}
              </code>
              . Any gateway keys using this provider in BYOK mode will lose
              access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteKey}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Delete Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Provider Key Card Sub-Component ────────────────────────────────────────

function ProviderKeyCard({
  providerKey: key,
  toggling,
  onToggle,
  onDelete,
}: {
  providerKey: ProviderKey
  toggling: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const meta = getProviderMeta(key.provider)
  const vBadge = verificationBadge(key.verification_status)
  const VIcon = vBadge.icon

  return (
    <motion.div variants={fadeIn}>
      <div
        className={`group relative rounded-lg border p-4 transition-all ${
          key.is_active
            ? 'bg-card hover:shadow-sm hover:border-foreground/20'
            : 'bg-muted/30 opacity-60'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Left: Provider info */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${meta.color}`}
              />
              <span className="truncate text-sm font-medium">
                {meta.label}
              </span>
              <Badge
                variant="outline"
                className={`px-1.5 py-0 text-[10px] font-normal ${vBadge.cls}`}
              >
                <VIcon className="mr-0.5 h-2.5 w-2.5" />
                {vBadge.text}
              </Badge>
              {!key.is_active && (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] font-normal text-zinc-500"
                >
                  Inactive
                </Badge>
              )}
            </div>

            {key.key_name && (
              <p className="truncate text-xs text-muted-foreground">
                {key.key_name}
              </p>
            )}

            <code className="block text-xs font-mono tracking-wider text-muted-foreground">
              {key.key_preview}
            </code>

            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeDate(key.created_at)}
              </span>
              {key.last_verified_at && (
                <span>
                  Verified {formatRelativeDate(key.last_verified_at)}
                </span>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={onToggle}
                disabled={toggling}
                className="text-xs"
              >
                {toggling ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : key.is_active ? (
                  <PowerOff className="mr-2 h-3.5 w-3.5" />
                ) : (
                  <Power className="mr-2 h-3.5 w-3.5" />
                )}
                {key.is_active ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-xs text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.div>
  )
}
