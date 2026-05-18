"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, Building2, Users, MoreVertical, LogOut, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useProfile } from "@/contexts/profile-context"
import { useAuth } from "@/contexts/auth-context"
import { useWorkspace } from "@/contexts/workspace-context"
import { useState } from 'react'

interface OrganizationsSettingsProps {
  userWorkspaces?: Array<{
    id: string
    slug: string
    name: string
    type: string
    role: string
    logo_url?: string
    member_count?: number
    plan_name?: string
  }>
}

export function OrganizationsSettings({ userWorkspaces = [] }: OrganizationsSettingsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { profile } = useProfile()
  const { user } = useAuth()
  const { workspace: _workspace } = useWorkspace()
  const [isLeaving, setIsLeaving] = useState<string | null>(null)
  
  // Get current workspace slug from URL
  const currentSlug = pathname?.split('/')[1]
  
  // Get user avatar for personal workspace fallback
  const userAvatar = profile?.avatar_url || user?.avatar_url
  
  // Handle leave organization
  const handleLeave = async (orgId: string, orgName: string) => {
    if (!confirm(`Are you sure you want to leave ${orgName}? You'll lose access to all workspace resources.`)) {
      return
    }
    
    setIsLeaving(orgId)
    try {
      const response = await fetch(`/api/organizations/${orgId}/leave`, {
        method: 'POST',
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to leave organization')
      }
      
      // Success - redirect to another workspace or home
      alert('Successfully left organization')
      window.location.href = '/'
    } catch (error: unknown) {
      console.error('Failed to leave organization:', error)
      alert(error instanceof Error ? error.message : 'Failed to leave organization. Please try again.')
    } finally {
      setIsLeaving(null)
    }
  }
  
  // Handle delete organization
  const handleDelete = async (orgId: string, orgName: string) => {
    if (!confirm(`Are you sure you want to DELETE ${orgName}? This action cannot be undone and will remove all data, members, and resources.`)) {
      return
    }
    
    // Double confirmation for destructive action
    const confirmText = prompt(`Type "${orgName}" to confirm deletion:`)
    if (confirmText !== orgName) {
      alert('Organization name does not match. Deletion cancelled.')
      return
    }
    
    setIsLeaving(orgId)
    try {
      const response = await fetch(`/api/organizations/${orgId}`, {
        method: 'DELETE',
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete organization')
      }
      
      // Success - redirect to another workspace or home
      alert('Organization deleted successfully')
      window.location.href = '/'
    } catch (error: unknown) {
      console.error('Failed to delete organization:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete organization. Please try again.')
    } finally {
      setIsLeaving(null)
    }
  }
  
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Organizations</h2>
          <p className="text-muted-foreground mt-1">
            Manage organizations you own or are a member of
          </p>
        </div>
        <Button asChild>
          <Link href="/onboarding/workspace/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Organization
          </Link>
        </Button>
      </div>

      {/* Organizations List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Organizations · {userWorkspaces.length}</CardTitle>
          <CardDescription>
            All organizations and workspaces you have access to
          </CardDescription>
        </CardHeader>
        <CardContent>
          {userWorkspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No organizations yet. Create one to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {userWorkspaces.map((workspace) => {
                // Determine workspace avatar (fallback to user for personal)
                const wsAvatar = workspace.type === 'personal' && !workspace.logo_url
                  ? userAvatar
                  : workspace.logo_url
                
                const isPersonal = workspace.type === 'personal'
                const isOwner = workspace.role === 'owner'
                const plan = workspace.plan_name || 'Free'
                const memberCount = workspace.member_count || 1
                const isCurrent = workspace.slug === currentSlug
                
                return (
                  <div 
                    key={workspace.id}
                    className={`flex items-center justify-between p-4 hover:bg-muted/50 rounded-lg transition-colors duration-120 ${
                      isCurrent ? 'border-2 border-primary' : 'border-2 border-transparent'
                    }`}
                  >
                    <div 
                      className="flex items-center gap-4 flex-1 cursor-pointer"
                      onClick={() => router.push(`/${workspace.slug}/dashboard`)}
                    >
                      <Avatar className="h-12 w-12 rounded-lg">
                        {wsAvatar && <AvatarImage src={wsAvatar} alt={workspace.name} />}
                        <AvatarFallback className="rounded-lg">
                          {workspace.name?.[0]?.toUpperCase() || 'W'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{workspace.name}</h3>
                          {isPersonal && (
                            <Badge variant="secondary" className="text-xs">
                              Personal
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" />
                            <span className="capitalize">{plan}</span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
                          </div>
                          <span>•</span>
                          <Badge variant="outline" className="text-xs capitalize">
                            {workspace.role}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    
                    {/* Actions Dropdown */}
                    {!isPersonal && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            disabled={isLeaving === workspace.id}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="z-[9999]">
                          {isOwner ? (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(workspace.id, workspace.name)
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Organization
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                handleLeave(workspace.id, workspace.name)
                              }}
                            >
                              <LogOut className="mr-2 h-4 w-4" />
                              Leave Organization
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
