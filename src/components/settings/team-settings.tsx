"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/ui/components/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Users, AlertCircle, Sparkles, UserPlus, Link as LinkIcon, Check } from 'lucide-react'
import { useWorkspace } from "@/contexts/workspace-context"
import { useLimit } from "@/components/access-control"
import { useProfile } from "@/contexts/profile-context"
import { useAuth } from "@/contexts/auth-context"
import { useSettings } from "@/contexts/settings-context"
import Link from "next/link"
import { InviteMembersModal } from "@/components/workspace/invite-members-modal"
import { useState, useEffect } from "react"

interface TeamMember {
  id: string
  user_id: string
  role: string
  profiles?: {
    name?: string
    first_name?: string
    handle?: string
    email?: string
    avatar_url?: string
  }
}

interface TeamSettingsProps {
  initialMembers?: TeamMember[] // Optional server-fetched members for instant display
}

export function TeamSettings({ initialMembers }: TeamSettingsProps = {}) {
  const { workspace } = useWorkspace()
  const { profile } = useProfile()
  const { user } = useAuth()
  const { settingsData, isLoading: isCacheLoading, refreshSettings } = useSettings()
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [userRole, setUserRole] = useState<string>('member')
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [inviteLinkEnabled, setInviteLinkEnabled] = useState(true)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [inviteLinkRole, setInviteLinkRole] = useState<string>('member')
  
  // Use cached data from context (instant!) or fallback to initialMembers
  const members = settingsData?.members || initialMembers || []
  const loadingMembers = isCacheLoading && !settingsData
  
  // Refresh members after mutations
  const fetchMembers = async () => {
    await refreshSettings()
  }
  
  // Update member role
  const handleRoleChange = async (memberId: string, newRole: string) => {
    if (!workspace?.org?.id) return
    
    try {
      await fetch(`/api/organizations/${workspace.org.id}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      })
      
      // Refresh cached members list
      await fetchMembers()
    } catch {
      // Role update failed silently
    }
  }

  // Remove member
  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!workspace?.org?.id) return
    if (!confirm(`Remove ${memberName} from the workspace?`)) return
    
    try {
      await fetch(`/api/organizations/${workspace.org.id}/members/${memberId}`, {
        method: 'DELETE'
      })
      
      // Refresh cached members list
      await fetchMembers()
    } catch {
      // Member removal failed silently
    }
  }
  
  // Sync invite token from cached settings data
  useEffect(() => {
    if (settingsData?.inviteToken) {
      const token = settingsData.inviteToken
      setInviteToken(token.token)
      setInviteLinkEnabled(token.enabled)
      if (token.role) {
        setInviteLinkRole(token.role)
      }
      setUserRole('owner') // If we have token access, user is owner
    }
  }, [settingsData])
  
  // Fallback: Fetch invite token if not in cache (shouldn't happen with prefetch)
  useEffect(() => {
    if (workspace?.org?.id && user?.id) {
      fetch(`/api/organizations/${workspace.org.id}/invites`)
        .then(async res => {
          if (!res.ok) {
            throw new Error(`API error: ${res.status}`)
          }
          return res.json()
        })
        .then(data => {
          if (data.token) {
            setInviteToken(data.token)
            setInviteLinkEnabled(data.enabled)
            // Sync dropdown with database role
            if (data.role) {
              setInviteLinkRole(data.role)
            }
            setUserRole('owner')
          }
        })
        .catch(() => {
          setUserRole('guest')
        })
    }
  }, [workspace?.org?.id, user?.id, settingsData])
  
  const currentMemberCount = (workspace?.org as unknown as Record<string, unknown>)?.member_count as number || 1
  const { limit } = useLimit('maxMembers', currentMemberCount)
  
  const isOwner = userRole === 'owner'
  const isAdmin = userRole === 'admin'
  const canInvite = isOwner || isAdmin // Only Owner + Admin can invite
  
  const usage = (currentMemberCount / limit) * 100
  const spotsRemaining = limit - currentMemberCount
  const planName = (workspace?.org as unknown as Record<string, unknown>)?.plan_name as string || 'Free'
  
  // Build invite link
  const inviteLink = inviteToken 
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${inviteToken}`
    : ''
  
  const copyInviteLink = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // Clipboard copy failed silently
    }
  }

  // Toggle invite link
  const handleToggle = async (enabled: boolean) => {
    if (!workspace?.org?.id) return
    
    setInviteLinkEnabled(enabled)
    
    try {
      await fetch(`/api/organizations/${workspace.org.id}/invites`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, role: inviteLinkRole })
      })
    } catch {
      // Revert on error
      setInviteLinkEnabled(!enabled)
    }
  }
  
  // Update invite link role
  const handleRoleUpdate = async (newRole: string) => {
    if (!workspace?.org?.id) {
      return
    }

    setInviteLinkRole(newRole)

    try {
      await fetch(`/api/organizations/${workspace.org.id}/invites`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole, enabled: inviteLinkEnabled })
      })
    } catch {
      // Role update failed silently
    }
  }

  // Generate new token
  const handleGenerateNewLink = async () => {
    if (!workspace?.org?.id || generatingToken) return
    
    setGeneratingToken(true)
    
    try {
      const res = await fetch(`/api/organizations/${workspace.org.id}/invites`, {
        method: 'POST'
      })
      
      const data = await res.json()
      
      if (data.token) {
        setInviteToken(data.token)
        setInviteLinkEnabled(data.enabled)
      }
    } catch {
      // Token generation failed silently
    } finally {
      setGeneratingToken(false)
    }
  }
  
  // Get user avatar and email
  const _userAvatar = profile?.avatar_url || user?.avatar_url
  const _userName = ((profile as unknown as Record<string, unknown>)?.pseudo as string) || user?.name || user?.email?.split('@')[0] || 'You'
  const walletObj = (user as unknown as Record<string, unknown>)?.wallet as Record<string, unknown> | undefined
  const _userEmail = user?.email || (walletObj?.address as string) || 'No email'

  if (!workspace?.org) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Team</h2>
          <p className="text-muted-foreground mt-1">
            Loading team information...
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">People</h2>
            <p className="text-muted-foreground mt-1">
              Manage team members and invitations
            </p>
          </div>
          {canInvite && (
            <Button onClick={() => setShowInviteModal(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add members
            </Button>
          )}
        </div>
        
        {/* Invite Link (Notion-style with toggle) */}
        {canInvite && (
          <div className="border rounded-lg">
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <LinkIcon className="h-4 w-4" />
                    <h3 className="font-medium">Invite link to add members</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Only people with permission to invite members can see this. You can also{' '}
                    <button 
                      onClick={handleGenerateNewLink}
                      disabled={generatingToken}
                      className="text-primary hover:underline disabled:opacity-50"
                    >
                      {generatingToken ? 'generating...' : 'generate a new link'}
                    </button>.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button 
                    variant="default"
                    size="sm"
                    onClick={copyInviteLink}
                    disabled={!inviteLinkEnabled}
                    className="shrink-0"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="h-3 w-3 mr-1.5" />
                        Copied!
                      </>
                    ) : (
                      'Copy link'
                    )}
                  </Button>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inviteLinkEnabled}
                      onChange={(e) => handleToggle(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
              
              {inviteLinkEnabled && (
                <>
                  <div className="mt-3 p-2 bg-muted rounded-md">
                    <code className="text-xs break-all text-muted-foreground">
                      {inviteLink}
                    </code>
                  </div>
                  
                  {/* Role selector for invite link */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">New members join as:</span>
                    <Select
                      value={inviteLinkRole}
                      onValueChange={handleRoleUpdate}
                    >
                      <SelectTrigger
                        className="w-[130px] h-8"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={5} className="z-[9999]">
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="guest">Guest</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Usage Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Team Members
              <Badge variant="outline">
                {currentMemberCount} / {limit === Infinity ? '∞' : limit}
              </Badge>
            </CardTitle>
            <CardDescription>
              {limit === Infinity ? (
                'Unlimited team members on your current plan'
              ) : (
                <>
                  You're using {currentMemberCount} of {limit} member slots on the{' '}
                  <span className="font-medium capitalize">{planName}</span> plan
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {limit !== Infinity && (
              <div className="space-y-2">
                <Progress value={usage} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {spotsRemaining} spot{spotsRemaining === 1 ? '' : 's'} remaining
                  </span>
                  {usage >= 80 && (
                    <span className="text-amber-500 font-medium">
                      {usage >= 100 ? 'Limit reached' : 'Almost full'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Warning when near/at limit */}
            {limit !== Infinity && usage >= 90 && (
              <Alert variant={usage >= 100 ? 'destructive' : 'default'}>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {usage >= 100 ? (
                        <>
                          <strong>Member limit reached.</strong> Upgrade your plan to add more team members.
                        </>
                      ) : (
                        <>
                          <strong>Almost at capacity.</strong> Consider upgrading soon to avoid interruptions.
                        </>
                      )}
                    </div>
                    <Link href="/pricing">
                      <Button size="sm" variant={usage >= 100 ? 'default' : 'outline'} className="shrink-0">
                        <Sparkles className="h-3 w-3 mr-1.5" />
                        Upgrade
                      </Button>
                    </Link>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Members Section (Notion-style table) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Members · {members.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMembers ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading members...
              </div>
            ) : (
              <div className="space-y-2">
                {members.map((member: TeamMember) => {
                  const isCurrentUser = member.user_id === user?.id
                  const memberProfile = member.profiles
                  const memberName = memberProfile?.name || memberProfile?.first_name || memberProfile?.handle || 'Member'
                  
                  // Display email if available, otherwise show "No Email"
                  const memberEmail = memberProfile?.email || 'No Email'
                  
                  const memberAvatar = memberProfile?.avatar_url
                  const canManageThisMember = (userRole === 'owner' || userRole === 'admin') && member.role !== 'owner'
                  
                  return (
                    <div 
                      key={member.id}
                      className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors duration-120"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Avatar className="h-9 w-9">
                          {memberAvatar && <AvatarImage src={memberAvatar} alt={memberName} />}
                          <AvatarFallback className="text-sm">
                            {memberName[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">
                            {memberName}
                            {isCurrentUser && <span className="text-muted-foreground ml-1">(You)</span>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {memberEmail}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Role selector for non-owners OR badge for owners */}
                        {member.role === 'owner' ? (
                          <Badge variant="outline" className="text-xs capitalize">
                            {member.role}
                          </Badge>
                        ) : canManageThisMember ? (
                          <Select
                            value={member.role}
                            onValueChange={(newRole) => handleRoleChange(member.id, newRole)}
                          >
                            <SelectTrigger
                              className="w-[120px] h-8 text-xs"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper" sideOffset={5} className="z-[9999]">
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="guest">Guest</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className="text-xs capitalize">
                            {member.role}
                          </Badge>
                        )}
                        
                        {/* Remove button for non-owners */}
                        {canManageThisMember && !isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-destructive hover:text-destructive"
                            onClick={() => handleRemoveMember(member.id, memberName)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invite Members Modal */}
      {workspace?.org && (
        <InviteMembersModal
          open={showInviteModal}
          onOpenChange={setShowInviteModal}
          workspaceId={workspace.org.id}
          workspaceName={workspace.org.name}
          currentMemberCount={currentMemberCount}
          zIndex={60}
        />
      )}
    </>
  )
}
