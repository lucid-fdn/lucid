"use client"

import { WorkspaceForm } from '@/components/settings/workspace-form'
import { useWorkspace } from '@/contexts/workspace-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useMemo } from 'react'

interface WorkspaceSettingsProps {
  userWorkspaces?: Array<{
    id: string
    slug: string
    name: string
    type: string
    role: string
    logo_url?: string
    bio?: string
    homepage?: string
    interests?: string[]
    github_username?: string
    twitter_username?: string
    linkedin_url?: string
    workspace_public?: boolean
  }>
}

export function WorkspaceSettings({ userWorkspaces = [] }: WorkspaceSettingsProps) {
  const { workspace } = useWorkspace()
  const router = useRouter()
  const pathname = usePathname()
  
  // ✅ FIX: Get workspace from URL, not context
  // Extract slug from pathname (e.g., /my-workspace/settings → my-workspace)
  const urlSlug = useMemo(() => {
    const segments = pathname?.split('/').filter(Boolean) || []
    return segments[0] || null
  }, [pathname])
  
  // ✅ FIX: Find the CORRECT workspace based on URL
  const currentWorkspace = useMemo(() => {
    if (!urlSlug || userWorkspaces.length === 0) {
      return workspace?.org // Fallback to context
    }
    return userWorkspaces.find(ws => ws.slug === urlSlug)
  }, [urlSlug, userWorkspaces, workspace])

  if (!currentWorkspace) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Workspace Profile</h2>
          <p className="text-muted-foreground mt-1">Loading...</p>
        </div>
      </div>
    )
  }

  const org = currentWorkspace as NonNullable<WorkspaceSettingsProps['userWorkspaces']>[number]
  // Type-safe role extraction
  const userRole = org.role || workspace?.role
  const isOwner = userRole === 'owner'
  const isAdmin = userRole === 'admin'
  const isPersonal = org.type === 'personal'
  
  // DEBUG LOGS - Understanding form disable issue
  console.log('[WorkspaceSettings] 🔍 Debug Info:', {
    workspace: {
      hasWorkspace: !!workspace,
      hasOrg: !!workspace?.org,
      orgId: org?.id,
      orgName: org?.name,
      orgType: org?.type,
    },
    roles: {
      userRole,
      isOwner,
      isAdmin,
      canEdit: isOwner || isAdmin,
    },
    permissions: {
      isPersonal,
      shouldBeReadOnly: !isOwner && !isAdmin,
    },
    rawWorkspace: workspace,
  })

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to DELETE ${org.name}? This action cannot be undone and will remove all data, members, and resources.`)) {
      return
    }
    
    const confirmText = prompt(`Type "${org.name}" to confirm deletion:`)
    if (confirmText !== org.name) {
      alert('Workspace name does not match. Deletion cancelled.')
      return
    }
    
    try {
      const response = await fetch(`/api/organizations/${org.id}`, {
        method: 'DELETE',
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete workspace')
      }
      
      alert('Workspace deleted successfully')
      router.push('/')
    } catch (error: unknown) {
      console.error('Failed to delete workspace:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete workspace. Please try again.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Workspace Profile</h2>
        <p className="text-muted-foreground mt-1">
          Manage your workspace's public information
        </p>
      </div>

      {/* Workspace Form */}
      <WorkspaceForm
        key={org.id}
        defaultValues={{
          name: org.name || '',
          logo_url: org.logo_url || '',
          bio: org.bio || '',
          homepage: org.homepage || '',
          interests: org.interests || [],
          github_username: org.github_username || '',
          twitter_username: org.twitter_username || '',
          linkedin_url: org.linkedin_url || '',
          workspace_public: org.workspace_public ?? true,
        }}
        workspaceId={org.id}
        workspaceName={org.name}
        isReadOnly={!isOwner && !isAdmin}
      />

      {/* Danger Zone - Only for owners of non-personal workspaces */}
      {isOwner && !isPersonal && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible actions for this workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Delete Workspace</h3>
                <p className="text-sm text-muted-foreground">
                  Permanently delete this workspace and all its data
                </p>
              </div>
              <Button 
                variant="destructive"
                onClick={handleDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
