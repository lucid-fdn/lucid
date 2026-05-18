"use client"

import * as React from "react"
import { Plus, Trash2, Edit, Key, Lock, Cloud, FileText, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

interface Credential {
  id: string
  name: string
  type: 'api_key' | 'basic_auth' | 'oauth2' | 'custom_headers'
  created_at: string
  updated_at: string
}

const CREDENTIAL_TYPES = [
  { value: 'api_key', label: 'API Key', icon: Key, description: 'Single API key with header' },
  { value: 'basic_auth', label: 'Basic Auth', icon: Lock, description: 'Username and password' },
  { value: 'oauth2', label: 'OAuth2', icon: Cloud, description: 'Access and refresh tokens' },
  { value: 'custom_headers', label: 'Custom Headers', icon: FileText, description: 'Custom HTTP headers' },
] as const

export function CredentialsSettings() {
  const toast = useToast()
  const [credentials, setCredentials] = React.useState<Credential[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showCreateModal, setShowCreateModal] = React.useState(false)
  const [editingCredential, setEditingCredential] = React.useState<Credential | null>(null)

  // Load credentials
  React.useEffect(() => {
    loadCredentials()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [])

  async function loadCredentials() {
    try {
      const response = await fetch('/api/credentials', {
        credentials: 'include',
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch credentials')
      }

      const data = await response.json()
      setCredentials(data.credentials || [])
    } catch (error) {
      console.error('Failed to load credentials:', error)
      toast.error('Failed to load credentials')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this credential? This action cannot be undone.')) return

    try {
      const response = await fetch(`/api/credentials/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete credential')
      }

      toast.success('The credential has been deleted.')
      loadCredentials()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete credential')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Credentials</h2>
          <p className="text-muted-foreground">
            Securely store API keys and authentication credentials
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Credential
        </Button>
      </div>

      {/* Credentials List */}
      <div className="grid gap-4">
        {loading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Loading credentials...
            </CardContent>
          </Card>
        ) : credentials.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Key className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">No credentials yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first credential to use in workflows
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Credential
              </Button>
            </CardContent>
          </Card>
        ) : (
          credentials.map((credential) => {
            const typeInfo = CREDENTIAL_TYPES.find(t => t.value === credential.type)
            const Icon = typeInfo?.icon || Key

            return (
              <Card key={credential.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{credential.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary">{typeInfo?.label}</Badge>
                          <span className="text-xs">
                            Created {new Date(credential.created_at).toLocaleDateString()}
                          </span>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingCredential(credential)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(credential.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            )
          })
        )}
      </div>

      {/* Create/Edit Modal */}
      <CredentialModal
        open={showCreateModal || editingCredential !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateModal(false)
            setEditingCredential(null)
          }
        }}
        credential={editingCredential}
        onSuccess={() => {
          setShowCreateModal(false)
          setEditingCredential(null)
          loadCredentials()
        }}
      />
    </div>
  )
}

interface CredentialModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  credential: Credential | null
  onSuccess: () => void
}

function CredentialModal({ open, onOpenChange, credential, onSuccess }: CredentialModalProps) {
  const toast = useToast()
  const [loading, setLoading] = React.useState(false)
  const [type, setType] = React.useState<string>(credential?.type || 'api_key')
  const [showSecrets, setShowSecrets] = React.useState(false)

  // Form state
  const [name, setName] = React.useState('')
  const [apiKey, setApiKey] = React.useState('')
  const [headerName, setHeaderName] = React.useState('Authorization')
  const [prefix, setPrefix] = React.useState('Bearer ')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [accessToken, setAccessToken] = React.useState('')
  const [refreshToken, setRefreshToken] = React.useState('')
  const [headers, setHeaders] = React.useState('{}')

  React.useEffect(() => {
    if (credential) {
      setName(credential.name)
      setType(credential.type)
    } else {
      // Reset form
      setName('')
      setType('api_key')
      setApiKey('')
      setHeaderName('Authorization')
      setPrefix('Bearer ')
      setUsername('')
      setPassword('')
      setAccessToken('')
      setRefreshToken('')
      setHeaders('{}')
    }
  }, [credential, open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      // Build credential data based on type
      let data: Record<string, unknown> = {}
      
      switch (type) {
        case 'api_key':
          data = { key: apiKey, headerName, prefix }
          break
        case 'basic_auth':
          data = { username, password }
          break
        case 'oauth2':
          data = { accessToken, refreshToken, tokenType: 'Bearer' }
          break
        case 'custom_headers':
          data = { headers: JSON.parse(headers) }
          break
      }

      const body = JSON.stringify({ name, type, data })

      const response = credential
        ? await fetch(`/api/credentials/${credential.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body,
          })
        : await fetch('/api/credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body,
          })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to save credential')
      }

      toast.success(
        credential ? 'Your credential has been updated.' : 'Your credential has been created.'
      )
      onSuccess()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save credential'
      )
    } finally {
      setLoading(false)
    }
  }

  const _selectedType = CREDENTIAL_TYPES.find(t => t.value === type)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {credential ? 'Edit Credential' : 'Create Credential'}
          </DialogTitle>
          <DialogDescription>
            {credential
              ? 'Update your credential information'
              : 'Add a new credential to use in your workflows'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="e.g., OpenAI Production API Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="type">Type *</Label>
            <Select value={type} onValueChange={setType} disabled={!!credential}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREDENTIAL_TYPES.map((t) => {
                  const Icon = t.icon
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        <div>
                          <div className="font-medium">{t.label}</div>
                          <div className="text-xs text-muted-foreground">{t.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Dynamic Fields Based on Type */}
          {type === 'api_key' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key *</Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showSecrets ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    required
                    placeholder="sk-..."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0"
                    onClick={() => setShowSecrets(!showSecrets)}
                  >
                    {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="headerName">Header Name</Label>
                  <Input
                    id="headerName"
                    value={headerName}
                    onChange={(e) => setHeaderName(e.target.value)}
                    placeholder="Authorization"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prefix">Prefix</Label>
                  <Input
                    id="prefix"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="Bearer "
                  />
                </div>
              </div>
            </>
          )}

          {type === 'basic_auth' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type={showSecrets ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </>
          )}

          {type === 'oauth2' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="accessToken">Access Token *</Label>
                <Textarea
                  id="accessToken"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  required
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="refreshToken">Refresh Token (Optional)</Label>
                <Textarea
                  id="refreshToken"
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  rows={2}
                />
              </div>
            </>
          )}

          {type === 'custom_headers' && (
            <div className="space-y-2">
              <Label htmlFor="headers">Headers (JSON) *</Label>
              <Textarea
                id="headers"
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                required
                rows={6}
                placeholder='{"X-API-Key": "your-key", "X-Custom-Header": "value"}'
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Enter headers as valid JSON object
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : credential ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
