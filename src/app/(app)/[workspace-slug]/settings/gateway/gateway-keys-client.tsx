'use client'

/**
 * Gateway Keys Client — Apple/Vercel-grade UI
 *
 * Tabbed layout:
 *  • Keys — CRUD with status badges, project scope, rotation/budget indicators
 *  • Templates — Save/load common configurations
 *
 * Design language: minimal chrome, generous whitespace, subtle animations,
 * monospace key previews, muted metadata, accent on primary actions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BookTemplate,
  Check,
  Clock,
  Copy,
  FolderKey,
  Key,
  Loader2,
  MoreVertical,
  Plus,
  RotateCw,
  Save,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { MultiModelSelector } from '@/components/gateway/multi-model-selector'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { KeyAuditTimeline } from './key-audit-timeline'
import { notificationCopy } from '@/lib/notifications/copy'

// ─── Types ──────────────────────────────────────────────────────────────────

interface GatewayKey {
  id: string
  org_id: string
  key_alias: string
  key_preview: string
  lucidgateway_key_id: string | null
  rpm_limit: number | null
  tpm_limit: number | null
  max_budget: number | null
  budget_duration: string | null
  models: string[]
  is_active: boolean
  status: string
  metadata: Record<string, unknown> | null
  created_by: string
  rotated_from_key_id: string | null
  project_id: string | null
  created_at: string
  updated_at: string
  revoked_at: string | null
}

interface KeyTemplate {
  id: string
  org_id: string
  template_name: string
  description: string | null
  config: {
    rpmLimit?: number
    tpmLimit?: number
    maxBudget?: number
    budgetDuration?: string
    models?: string[]
    rotationEnabled?: boolean
    rotationDays?: number
    alertWarningPercent?: number
    alertCriticalPercent?: number
  }
  created_by: string
  created_at: string
  updated_at: string
}

interface GatewayPlanLimits {
  maxGatewayKeys: number
  gatewayKeyCustomLimits: boolean
  gatewayKeyRotation: boolean
  gatewayKeyAudit: boolean
  gatewayKeyTemplates: boolean
  gatewayKeyBudgets: boolean
  gatewayMaxModels: number
}

interface GatewayKeysClientProps {
  orgId: string
}

// ─── Form defaults ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  keyAlias: '',
  rpmLimit: '',
  tpmLimit: '',
  maxBudget: '',
  budgetDuration: '',
  models: [] as string[],
  rotationEnabled: false,
  rotationDays: '90',
  alertWarningPercent: '80',
  alertCriticalPercent: '95',
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

function _formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

function formatRelativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function statusColor(status: string) {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    case 'rotated':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    case 'revoked':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
    default:
      return 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20'
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function GatewayKeysClient({ orgId }: GatewayKeysClientProps) {
  // State — Keys
  const [keys, setKeys] = useState<GatewayKey[]>([])
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState<string>('starter')
  const [planLimits, setPlanLimits] = useState<GatewayPlanLimits | null>(null)

  // State — Templates
  const [templates, setTemplates] = useState<KeyTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDesc, setTemplateDesc] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<KeyTemplate | null>(null)

  // State — Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [rotateDialogOpen, setRotateDialogOpen] = useState(false)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [selectedKeyForRotate, setSelectedKeyForRotate] = useState<GatewayKey | null>(null)
  const [keyToRevoke, setKeyToRevoke] = useState<GatewayKey | null>(null)
  const [virtualKeyRevealed, setVirtualKeyRevealed] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [copied, setCopied] = useState(false)

  // Form
  const [formData, setFormData] = useState(EMPTY_FORM)

  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast

  // ── Derived ─────────────────────────────────────────────────────────────

  const activeKeys = useMemo(() => keys.filter((k) => k.is_active), [keys])
  const inactiveKeys = useMemo(() => keys.filter((k) => !k.is_active), [keys])

  // Plan-aware derived state
  const isStarterPlan = plan === 'starter'
  const canCreateKeys = planLimits?.gatewayKeyCustomLimits ?? false
  const canRotateKeys = planLimits?.gatewayKeyRotation ?? false
  const canUseTemplates = planLimits?.gatewayKeyTemplates ?? false
  const maxKeys = planLimits?.maxGatewayKeys ?? 1
  const atKeyLimit = activeKeys.length >= maxKeys
  const isAutoProvisionedKey = useCallback(
    (key: GatewayKey) =>
      key.metadata != null &&
      typeof key.metadata === 'object' &&
      (key.metadata as Record<string, unknown>).auto_provisioned === true,
    [],
  )

  // ── Loaders ─────────────────────────────────────────────────────────────

  const loadKeys = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/orgs/${orgId}/lucidgateway-keys`)
      if (!res.ok) throw new Error('Failed to load keys')
      const data = await res.json()
      setKeys(data.keys || [])
      if (data.plan) setPlan(data.plan)
      if (data.limits) setPlanLimits(data.limits)
    } catch (error) {
      toastRef.current.error('Error', error instanceof Error ? error.message : 'Failed to load keys')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  const loadTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true)
      const res = await fetch(`/api/orgs/${orgId}/lucidgateway-keys/templates`)
      if (!res.ok) throw new Error('Failed to load templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch {
      // Silently fail — templates are optional
    } finally {
      setTemplatesLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    loadKeys()
    loadTemplates()
  }, [loadKeys, loadTemplates])

  // ── Template Actions ────────────────────────────────────────────────────

  const applyTemplate = useCallback((template: KeyTemplate) => {
    const c = template.config
    setFormData({
      ...EMPTY_FORM,
      rpmLimit: c.rpmLimit?.toString() || '',
      tpmLimit: c.tpmLimit?.toString() || '',
      maxBudget: c.maxBudget?.toString() || '',
      budgetDuration: c.budgetDuration || '',
      models: c.models || [],
      rotationEnabled: c.rotationEnabled || false,
      rotationDays: c.rotationDays?.toString() || '90',
      alertWarningPercent: c.alertWarningPercent?.toString() || '80',
      alertCriticalPercent: c.alertCriticalPercent?.toString() || '95',
    })
    setCreateDialogOpen(true)
    toast.success('Template loaded', `Applied "${template.template_name}" configuration`)
  }, [toast])

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return
    try {
      setSavingTemplate(true)
      const config = {
        rpmLimit: formData.rpmLimit ? parseInt(formData.rpmLimit, 10) : undefined,
        tpmLimit: formData.tpmLimit ? parseInt(formData.tpmLimit, 10) : undefined,
        maxBudget: formData.maxBudget ? parseFloat(formData.maxBudget) : undefined,
        budgetDuration: formData.budgetDuration || undefined,
        models: formData.models.length > 0 ? formData.models : undefined,
        rotationEnabled: formData.rotationEnabled || undefined,
        rotationDays: formData.rotationEnabled ? parseInt(formData.rotationDays, 10) : undefined,
        alertWarningPercent: formData.alertWarningPercent
          ? parseInt(formData.alertWarningPercent, 10)
          : undefined,
        alertCriticalPercent: formData.alertCriticalPercent
          ? parseInt(formData.alertCriticalPercent, 10)
          : undefined,
      }

      const res = await fetch(`/api/orgs/${orgId}/lucidgateway-keys/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: templateName.trim(),
          description: templateDesc.trim() || undefined,
          config,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save template')
      }

      setSaveTemplateOpen(false)
      setTemplateName('')
      setTemplateDesc('')
      await loadTemplates()
      toast.success('Template saved', `"${templateName}" is ready to use`)
    } catch (error) {
      toast.error(notificationCopy.title.error, error instanceof Error ? error.message : 'Failed to save template')
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/lucidgateway-keys/templates?templateId=${templateToDelete.id}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error('Failed to delete template')
      setTemplateToDelete(null)
      await loadTemplates()
      toast.success('Deleted', 'Template removed')
    } catch (error) {
      toast.error(notificationCopy.title.error, error instanceof Error ? error.message : 'Failed to delete')
    }
  }

  // ── Key Actions ─────────────────────────────────────────────────────────

  const handleCreateKey = async () => {
    try {
      setSubmitting(true)
      const body: Record<string, unknown> = { keyAlias: formData.keyAlias }
      if (formData.rpmLimit) body.rpmLimit = parseInt(formData.rpmLimit, 10)
      if (formData.tpmLimit) body.tpmLimit = parseInt(formData.tpmLimit, 10)
      if (formData.maxBudget) body.maxBudget = parseFloat(formData.maxBudget)
      if (formData.budgetDuration) body.budgetDuration = formData.budgetDuration
      if (formData.models.length > 0) body.models = formData.models

      const res = await fetch(`/api/orgs/${orgId}/lucidgateway-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to create key')
      }

      const data = await res.json()
      setVirtualKeyRevealed(data.virtualKey)
      setCreateDialogOpen(false)
      setFormData(EMPTY_FORM)
      await loadKeys()
      toast.success('Key created', 'Your LucidGateway key is ready.')
    } catch (error) {
      toast.error(notificationCopy.title.error, error instanceof Error ? error.message : 'Failed to create key')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRotateKey = async () => {
    if (!selectedKeyForRotate) return
    try {
      setSubmitting(true)
      const body: Record<string, unknown> = {
        keyAlias: formData.keyAlias || `${selectedKeyForRotate.key_alias}-rotated`,
        rotateFromKeyId: selectedKeyForRotate.id,
      }
      if (formData.rpmLimit) body.rpmLimit = parseInt(formData.rpmLimit, 10)
      if (formData.tpmLimit) body.tpmLimit = parseInt(formData.tpmLimit, 10)
      if (formData.maxBudget) body.maxBudget = parseFloat(formData.maxBudget)
      if (formData.budgetDuration) body.budgetDuration = formData.budgetDuration
      if (formData.models.length > 0) body.models = formData.models

      const res = await fetch(`/api/orgs/${orgId}/lucidgateway-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to rotate key')
      }

      const data = await res.json()
      setVirtualKeyRevealed(data.virtualKey)
      setRotateDialogOpen(false)
      setSelectedKeyForRotate(null)
      setFormData(EMPTY_FORM)
      await loadKeys()
      toast.success('Key rotated', 'Old key deactivated. New key is active.')
    } catch (error) {
      toast.error(notificationCopy.title.error, error instanceof Error ? error.message : 'Failed to rotate key')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRevokeKey = async () => {
    if (!keyToRevoke) return
    try {
      setRevoking(true)
      const res = await fetch(`/api/orgs/${orgId}/lucidgateway-keys/${keyToRevoke.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to revoke key')
      }
      setRevokeDialogOpen(false)
      setKeyToRevoke(null)
      await loadKeys()
      toast.success('Key revoked', 'The key has been permanently deactivated.')
    } catch (error) {
      toast.error(notificationCopy.title.error, error instanceof Error ? error.message : 'Failed to revoke key')
    } finally {
      setRevoking(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Copied', 'Key copied to clipboard')
  }

  // ── Loading State ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading gateway keys…</p>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Tabs defaultValue="keys" className="w-full">
        <div className="flex items-center justify-between">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="keys" className="gap-1.5 text-sm">
              <Key className="h-3.5 w-3.5" />
              Keys
              {activeKeys.length > 0 && (
                <span className="ml-1 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {activeKeys.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5 text-sm">
              <BookTemplate className="h-3.5 w-3.5" />
              Templates
              {templates.length > 0 && (
                <span className="ml-1 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {templates.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {canCreateKeys ? (
            <Button
              onClick={() => {
                setFormData(EMPTY_FORM)
                setCreateDialogOpen(true)
              }}
              size="sm"
              className="gap-1.5"
              disabled={atKeyLimit}
              title={atKeyLimit ? `Key limit reached (${activeKeys.length}/${maxKeys})` : undefined}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Key
              {atKeyLimit && (
                <span className="ml-1 text-[10px] opacity-70">({activeKeys.length}/{maxKeys})</span>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              onClick={() =>
                toast.info(
                  'Upgrade to Pro',
                  'Custom key creation, rotation, and templates require a Pro plan.',
                )
              }
            >
              <Sparkles className="h-3.5 w-3.5" />
              Upgrade to Create Keys
            </Button>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* KEYS TAB                                                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="keys" className="mt-6 space-y-6">
          {/* Free tier info banner */}
          {isStarterPlan && activeKeys.length > 0 && (
            <motion.div {...fadeIn}>
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    Free Tier — Auto-provisioned Key
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your key has system defaults: 10 RPM, 5K TPM, {activeKeys[0]?.models?.length || 20} models, $5/mo budget.
                    Upgrade to Pro to create custom keys, configure limits, rotate, and access templates.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Active Keys */}
          {activeKeys.length === 0 && inactiveKeys.length === 0 ? (
            <motion.div {...fadeIn}>
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Key className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium">No gateway keys yet</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground max-w-sm text-center">
                    Create your first LucidGateway API key to start routing requests through 100+ AI models.
                  </p>
                  <Button
                    onClick={() => setCreateDialogOpen(true)}
                    className="mt-6 gap-1.5"
                    size="sm"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create your first key
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <>
              {activeKeys.length > 0 && (
                <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
                    Active Keys
                  </h3>
                  {activeKeys.map((key) => (
                    <KeyCard
                      key={key.id}
                      gatewayKey={key}
                      isAutoProvisioned={isAutoProvisionedKey(key)}
                      onRotate={
                        canRotateKeys && !isAutoProvisionedKey(key)
                          ? () => {
                              setSelectedKeyForRotate(key)
                              setFormData({
                                ...EMPTY_FORM,
                                rpmLimit: key.rpm_limit?.toString() || '',
                                tpmLimit: key.tpm_limit?.toString() || '',
                                maxBudget: key.max_budget?.toString() || '',
                                budgetDuration: key.budget_duration || '',
                                models: key.models || [],
                              })
                              setRotateDialogOpen(true)
                            }
                          : undefined
                      }
                      onRevoke={
                        canCreateKeys && !isAutoProvisionedKey(key)
                          ? () => {
                              setKeyToRevoke(key)
                              setRevokeDialogOpen(true)
                            }
                          : undefined
                      }
                    />
                  ))}
                </motion.div>
              )}

              {inactiveKeys.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1">
                    Inactive Keys
                  </h3>
                  {inactiveKeys.map((key) => (
                    <KeyCard key={key.id} gatewayKey={key} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Audit Timeline */}
          <KeyAuditTimeline orgId={orgId} />
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* TEMPLATES TAB                                                  */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <TabsContent value="templates" className="mt-6 space-y-4">
          {!canUseTemplates ? (
            <motion.div {...fadeIn}>
              <Card className="border-dashed border-amber-500/20">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="rounded-full bg-amber-500/10 p-4 mb-4">
                    <BookTemplate className="h-8 w-8 text-amber-500" />
                  </div>
                  <h3 className="text-lg font-medium">Templates require Pro</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground max-w-sm text-center">
                    Save and reuse key configurations with templates on the Pro plan.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ) : templatesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <motion.div {...fadeIn}>
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <BookTemplate className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium">No templates saved</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground max-w-sm text-center">
                    Save key configurations as templates to quickly create new keys with consistent settings.
                  </p>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Open the Create Key dialog and click &quot;Save as Template&quot;
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div variants={stagger} initial="initial" animate="animate" className="grid gap-3 sm:grid-cols-2">
              {templates.map((template) => (
                <motion.div key={template.id} variants={fadeIn}>
                  <Card className="group relative overflow-hidden transition-all hover:shadow-md hover:border-foreground/20">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-base">{template.template_name}</CardTitle>
                          {template.description && (
                            <CardDescription className="text-xs">
                              {template.description}
                            </CardDescription>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem
                              onClick={() => applyTemplate(template)}
                              className="text-xs"
                            >
                              <Sparkles className="mr-2 h-3.5 w-3.5" />
                              Use Template
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setTemplateToDelete(template)}
                              className="text-xs text-destructive"
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-1.5">
                        {template.config.rpmLimit && (
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            RPM: {template.config.rpmLimit.toLocaleString()}
                          </Badge>
                        )}
                        {template.config.tpmLimit && (
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            TPM: {template.config.tpmLimit.toLocaleString()}
                          </Badge>
                        )}
                        {template.config.maxBudget && (
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            ${template.config.maxBudget}
                          </Badge>
                        )}
                        {template.config.models && template.config.models.length > 0 && (
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            {template.config.models.length} model{template.config.models.length > 1 ? 's' : ''}
                          </Badge>
                        )}
                        {template.config.rotationEnabled && (
                          <Badge variant="secondary" className="text-[10px] font-normal">
                            <RotateCw className="mr-1 h-2.5 w-2.5" />
                            {template.config.rotationDays}d rotation
                          </Badge>
                        )}
                      </div>
                      <button
                        onClick={() => applyTemplate(template)}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" />
                        Create key from template
                      </button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CREATE KEY DIALOG                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Create Gateway Key
            </DialogTitle>
            <DialogDescription>
              Configure limits, model access, and rotation policies for your new API key.
            </DialogDescription>
          </DialogHeader>

          {/* Template quick-load */}
          {templates.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <BookTemplate className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Load from:</span>
              <div className="flex flex-wrap gap-1">
                {templates.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      const c = t.config
                      setFormData((prev) => ({
                        ...prev,
                        rpmLimit: c.rpmLimit?.toString() || prev.rpmLimit,
                        tpmLimit: c.tpmLimit?.toString() || prev.tpmLimit,
                        maxBudget: c.maxBudget?.toString() || prev.maxBudget,
                        budgetDuration: c.budgetDuration || prev.budgetDuration,
                        models: c.models || prev.models,
                        rotationEnabled: c.rotationEnabled ?? prev.rotationEnabled,
                        rotationDays: c.rotationDays?.toString() || prev.rotationDays,
                        alertWarningPercent: c.alertWarningPercent?.toString() || prev.alertWarningPercent,
                        alertCriticalPercent: c.alertCriticalPercent?.toString() || prev.alertCriticalPercent,
                      }))
                      toast.success('Applied', `Loaded "${t.template_name}"`)
                    }}
                    className="rounded-md bg-background px-2 py-0.5 text-[11px] font-medium border transition-colors hover:bg-accent"
                  >
                    {t.template_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="keyAlias" className="text-xs font-medium">
                Key Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="keyAlias"
                placeholder="e.g. production-api, staging-v2"
                value={formData.keyAlias}
                onChange={(e) => setFormData({ ...formData, keyAlias: e.target.value })}
                className="h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">RPM Limit</Label>
                <Input
                  type="number"
                  placeholder="1,000"
                  value={formData.rpmLimit}
                  onChange={(e) => setFormData({ ...formData, rpmLimit: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">TPM Limit</Label>
                <Input
                  type="number"
                  placeholder="50,000"
                  value={formData.tpmLimit}
                  onChange={(e) => setFormData({ ...formData, tpmLimit: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Budget ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="100.00"
                  value={formData.maxBudget}
                  onChange={(e) => setFormData({ ...formData, maxBudget: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Budget Period</Label>
                <Input
                  placeholder="1h, 1d, 1mo"
                  value={formData.budgetDuration}
                  onChange={(e) => setFormData({ ...formData, budgetDuration: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Allowed Models</Label>
              <MultiModelSelector
                value={formData.models}
                onChange={(models) => setFormData({ ...formData, models })}
                disabled={submitting}
              />
            </div>

            {/* Rotation & Alerts — Collapsible */}
            <details className="group rounded-lg border bg-muted/30 px-3 py-2">
              <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground select-none">
                <Shield className="h-3.5 w-3.5" />
                Advanced: Rotation & Alerts
              </summary>
              <div className="mt-3 space-y-3 pb-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="rotationEnabled"
                    checked={formData.rotationEnabled}
                    onChange={(e) =>
                      setFormData({ ...formData, rotationEnabled: e.target.checked })
                    }
                    className="rounded border-border"
                  />
                  <Label htmlFor="rotationEnabled" className="cursor-pointer text-xs">
                    Auto-rotate every
                  </Label>
                  {formData.rotationEnabled && (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={formData.rotationDays}
                        onChange={(e) =>
                          setFormData({ ...formData, rotationDays: e.target.value })
                        }
                        className="h-7 w-16 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">days</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Warning at %</Label>
                    <Input
                      type="number"
                      value={formData.alertWarningPercent}
                      onChange={(e) =>
                        setFormData({ ...formData, alertWarningPercent: e.target.value })
                      }
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Critical at %</Label>
                    <Input
                      type="number"
                      value={formData.alertCriticalPercent}
                      onChange={(e) =>
                        setFormData({ ...formData, alertCriticalPercent: e.target.value })
                      }
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              </div>
            </details>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSaveTemplateOpen(true)}
              className="mr-auto gap-1.5 text-xs text-muted-foreground"
            >
              <Save className="h-3 w-3" />
              Save as Template
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateKey} disabled={!formData.keyAlias || submitting}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SAVE TEMPLATE DIALOG                                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Save as Template</DialogTitle>
            <DialogDescription className="text-xs">
              Save the current configuration for quick reuse.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Template Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Production Standard"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Description</Label>
              <Input
                placeholder="Optional description"
                value={templateDesc}
                onChange={(e) => setTemplateDesc(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveTemplateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveTemplate} disabled={!templateName.trim() || savingTemplate}>
              {savingTemplate && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ROTATE KEY DIALOG                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={rotateDialogOpen} onOpenChange={setRotateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCw className="h-4 w-4" />
              Rotate Key
            </DialogTitle>
            <DialogDescription>
              Replace{' '}
              <span className="font-medium font-mono text-foreground">
                {selectedKeyForRotate?.key_alias}
              </span>{' '}
              with a new key. The old key will be deactivated immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">New Key Name</Label>
              <Input
                placeholder={
                  selectedKeyForRotate
                    ? `${selectedKeyForRotate.key_alias}-rotated`
                    : 'new-key-alias'
                }
                value={formData.keyAlias}
                onChange={(e) => setFormData({ ...formData, keyAlias: e.target.value })}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">
                Leave limits empty to inherit from the current key.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">RPM Limit</Label>
                <Input
                  type="number"
                  placeholder={selectedKeyForRotate?.rpm_limit?.toString() || '—'}
                  value={formData.rpmLimit}
                  onChange={(e) => setFormData({ ...formData, rpmLimit: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">TPM Limit</Label>
                <Input
                  type="number"
                  placeholder={selectedKeyForRotate?.tpm_limit?.toString() || '—'}
                  value={formData.tpmLimit}
                  onChange={(e) => setFormData({ ...formData, tpmLimit: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRotateDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleRotateKey} disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Rotate Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* REVOKE CONFIRMATION                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Revoke Gateway Key
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently deactivate{' '}
              <span className="font-medium font-mono text-foreground">
                {keyToRevoke?.key_alias}
              </span>
              . Any applications using this key will immediately lose access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeKey}
              disabled={revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* DELETE TEMPLATE CONFIRMATION                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!templateToDelete} onOpenChange={() => setTemplateToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{templateToDelete?.template_name}&quot;? This won&apos;t affect any keys already created from this template.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTemplate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* KEY REVEALED DIALOG                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!virtualKeyRevealed} onOpenChange={() => setVirtualKeyRevealed(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-500" />
              Key Created
            </DialogTitle>
            <DialogDescription>
              Copy your key now — it won&apos;t be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <div className="group relative rounded-lg border bg-muted/50 p-4">
              <code className="block break-all text-sm font-mono leading-relaxed">
                {virtualKeyRevealed}
              </code>
              <Button
                size="sm"
                variant="ghost"
                className="absolute right-2 top-2 h-8 w-8 p-0"
                onClick={() => copyToClipboard(virtualKeyRevealed!)}
              >
                <AnimatePresence mode="wait">
                  {copied ? (
                    <motion.div key="check" {...fadeIn}>
                      <Check className="h-4 w-4 text-emerald-500" />
                    </motion.div>
                  ) : (
                    <motion.div key="copy" {...fadeIn}>
                      <Copy className="h-4 w-4" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={() => setVirtualKeyRevealed(null)} className="w-full">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Key Card Sub-Component ─────────────────────────────────────────────────

function KeyCard({
  gatewayKey: key,
  isAutoProvisioned,
  onRotate,
  onRevoke,
}: {
  gatewayKey: GatewayKey
  isAutoProvisioned?: boolean
  onRotate?: () => void
  onRevoke?: () => void
}) {
  const isActive = key.is_active
  const hasLimits = key.rpm_limit || key.tpm_limit || key.max_budget
  const hasModels = key.models && key.models.length > 0
  const rotationMeta = key.metadata as {
    rotation_policy?: { enabled: boolean; interval_days: number }
    alert_thresholds?: { warning_percent: number; critical_percent: number }
  } | null

  return (
    <motion.div variants={fadeIn}>
      <div
        className={`group relative rounded-lg border p-4 transition-all ${
          isActive
            ? 'bg-card hover:shadow-sm hover:border-foreground/20'
            : 'bg-muted/30 opacity-60'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Left: Key info */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{key.key_alias}</span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 font-normal ${statusColor(key.status)}`}
              >
                {key.status}
              </Badge>
              {isAutoProvisioned && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal gap-1 border-amber-500/20 text-amber-600 dark:text-amber-400">
                  Auto
                </Badge>
              )}
              {key.project_id && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal gap-1">
                  <FolderKey className="h-2.5 w-2.5" />
                  Project-scoped
                </Badge>
              )}
              {rotationMeta?.rotation_policy?.enabled && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal gap-1 border-blue-500/20 text-blue-600 dark:text-blue-400">
                  <RotateCw className="h-2.5 w-2.5" />
                  {rotationMeta.rotation_policy.interval_days}d
                </Badge>
              )}
            </div>

            <code className="block text-xs font-mono text-muted-foreground tracking-wider">
              {key.key_preview}
            </code>

            {/* Metadata row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {hasLimits && (
                <div className="flex items-center gap-3">
                  {key.rpm_limit && <span>RPM {key.rpm_limit.toLocaleString()}</span>}
                  {key.tpm_limit && <span>TPM {key.tpm_limit.toLocaleString()}</span>}
                  {key.max_budget && (
                    <span>
                      ${key.max_budget}
                      {key.budget_duration && <span className="text-muted-foreground/60">/{key.budget_duration}</span>}
                    </span>
                  )}
                </div>
              )}
              {hasModels && (
                <span>
                  {key.models.length} model{key.models.length > 1 ? 's' : ''}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeDate(key.created_at)}
              </span>
            </div>
          </div>

          {/* Right: Actions */}
          {isActive && (onRotate || onRevoke) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {onRotate && (
                  <DropdownMenuItem onClick={onRotate} className="text-xs">
                    <RotateCw className="mr-2 h-3.5 w-3.5" />
                    Rotate
                  </DropdownMenuItem>
                )}
                {onRevoke && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onRevoke} className="text-xs text-destructive">
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Revoke
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </motion.div>
  )
}