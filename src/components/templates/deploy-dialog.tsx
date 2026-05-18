'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getCSRFTokenFromCookie } from '@/lib/auth/csrf-client'
import { buildProjectAgentDetailPath } from '@/lib/projects/urls'
import type { DeployTemplateResult, TemplateCatalogEntry } from '@contracts/template'

interface DeployDialogProps {
  template: TemplateCatalogEntry | null
  orgId: string
  workspaceSlug: string
  projectId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getParamInputType(type: TemplateCatalogEntry['params'][number]['type']): string {
  if (type === 'email') return 'email'
  if (type === 'url') return 'url'
  if (type === 'secret') return 'password'
  return 'text'
}

export function DeployDialog({
  template,
  orgId,
  workspaceSlug,
  projectId,
  open,
  onOpenChange,
}: DeployDialogProps) {
  const [nameOverride, setNameOverride] = useState('')
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [deployError, setDeployError] = useState<string | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [result, setResult] = useState<DeployTemplateResult | null>(null)

  useEffect(() => {
    if (!open) {
      setNameOverride('')
      setParamValues({})
      setDeployError(null)
      setResult(null)
      setIsDeploying(false)
    }
  }, [open, template?.id])

  const params = template?.params ?? []
  const missingRequired = useMemo(
    () => params
      .filter((param) => param.required)
      .some((param) => !(paramValues[param.key] ?? param.default ?? '').trim()),
    [params, paramValues],
  )

  const viewUrl = result
    ? result.kind === 'agent' && result.assistant_id && result.project_slug
      ? buildProjectAgentDetailPath(workspaceSlug, result.project_slug, result.assistant_id)
      : null
    : null

  async function ensureCSRFToken(): Promise<string | null> {
    let csrfToken = getCSRFTokenFromCookie()
    if (!csrfToken) {
      await fetch('/api/auth/csrf', { credentials: 'same-origin' }).catch(() => {})
      csrfToken = getCSRFTokenFromCookie()
    }
    return csrfToken
  }

  async function handleDeploy(): Promise<void> {
    if (!template) return
    if (missingRequired) {
      const message = 'Fill in all required fields before deploying'
      setDeployError(message)
      toast.error(message)
      return
    }

    setDeployError(null)
    setIsDeploying(true)

    try {
      const csrfToken = await ensureCSRFToken()
      const payloadParams = Object.fromEntries(
        params.flatMap((param) => {
          const value = (paramValues[param.key] ?? '').trim()
          if (!value) return []
          return [[param.key, value]]
        }),
      )

      const response = await fetch(`/api/templates/${template.id}/deploy`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          ...(projectId ? { project_id: projectId } : {}),
          params: payloadParams,
          name_override: nameOverride.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Deploy failed' }))
        throw new Error(typeof data.error === 'string' ? data.error : 'Deploy failed')
      }

      const data: DeployTemplateResult = await response.json()
      setResult(data)
      toast.success(`${template.name} deployed successfully`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deploy failed'
      setDeployError(message)
      toast.error(message)
    } finally {
      setIsDeploying(false)
    }
  }

  if (!template) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deploy {template.name}</DialogTitle>
          {template.description ? (
            <DialogDescription>{template.description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {result ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle className="size-10 text-primary" />
            <div className="flex flex-col gap-1">
              <p className="text-base font-medium text-foreground">Deployment complete</p>
              <p className="text-sm text-muted-foreground">
                Your {result.kind === 'agent' ? 'agent' : 'team'} is ready.
              </p>
            </div>
            {viewUrl ? (
              <Button asChild size="sm">
                <Link href={viewUrl}>
                  View agent
                  <ExternalLink data-icon="inline-end" />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="template-name-override">Name</Label>
              <Input
                id="template-name-override"
                value={nameOverride}
                onChange={(event) => setNameOverride(event.target.value)}
                placeholder={template.name}
                maxLength={100}
              />
            </div>

            {params.map((param) => (
              <div key={param.key} className="flex flex-col gap-2">
                <Label htmlFor={`template-param-${param.key}`}>
                  {param.label}
                  {param.required ? ' *' : ''}
                </Label>

                {param.type === 'select' && param.options?.length ? (
                  <Select
                    value={paramValues[param.key] ?? param.default ?? ''}
                    onValueChange={(value) => {
                      setParamValues((current) => ({ ...current, [param.key]: value }))
                    }}
                  >
                    <SelectTrigger id={`template-param-${param.key}`}>
                      <SelectValue placeholder={param.placeholder ?? `Select ${param.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {param.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={`template-param-${param.key}`}
                    type={getParamInputType(param.type)}
                    value={paramValues[param.key] ?? param.default ?? ''}
                    onChange={(event) => {
                      setParamValues((current) => ({ ...current, [param.key]: event.target.value }))
                    }}
                    placeholder={param.placeholder ?? param.label}
                    maxLength={1000}
                  />
                )}

                {param.hint ? (
                  <p className="text-sm text-muted-foreground">{param.hint}</p>
                ) : null}
              </div>
            ))}

            {deployError ? (
              <p className="text-sm text-destructive">{deployError}</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeploying}>
                Cancel
              </Button>
              <Button onClick={handleDeploy} disabled={isDeploying || missingRequired}>
                {isDeploying ? (
                  <>
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                    Deploying
                  </>
                ) : (
                  'Deploy'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
