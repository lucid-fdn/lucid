/**
 * Workspace Team Settings
 * Pattern: /{workspace-slug}/settings/team
 */

import { getWorkspaceWithAccess } from '@/lib/workspace'
import { requireUserId } from '@/lib/auth/server-utils'
import { hasPermission, getWorkspacePlan } from '@/lib/access-control'
import { TeamMembersList } from '@/components/org/team-members-list'
import { PendingInvitesList } from '@/components/org/pending-invites-list'
import { Card } from '@/components/ui/card'
import { Users, AlertCircle, Sparkles } from 'lucide-react'
import { Alert, AlertDescription } from '@/ui/components/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function TeamSettings({
  params,
  searchParams,
}: {
  params: Promise<{ 'workspace-slug': string }>
  searchParams: Promise<{ search?: string }>
}) {
  const { 'workspace-slug': workspaceSlug } = await params
  const _resolvedSearchParams = await searchParams
  const userId = await requireUserId()
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  
  if (!workspace) {
    return null // Layout handles access control
  }
  
  // Check permissions
  const _canInvite = await hasPermission(workspace.id, userId, 'inviteMembers')
  
  // Get member count and limits
  const { plan, limits } = await getWorkspacePlan(workspace.id)
  const memberCount = workspace.member_count || 1
  const memberLimit = limits.maxMembers
  const usage = (memberCount / memberLimit) * 100
  const spotsRemaining = memberLimit - memberCount
  
  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold">Team</h1>
            <p className="text-muted-foreground mt-2">
              Manage team members and invitations
            </p>
          </div>
        </div>
        
        {/* Usage Card */}
        <Card className="p-6 mt-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">Team Members</h3>
                <Badge variant="outline">
                  {memberCount} / {memberLimit === Infinity ? '∞' : memberLimit}
                </Badge>
              </div>
              
              <p className="text-sm text-muted-foreground mb-4">
                {memberLimit === Infinity ? (
                  'Unlimited team members on your current plan'
                ) : (
                  <>
                    You're using {memberCount} of {memberLimit} member slots on the{' '}
                    <span className="font-medium capitalize">{plan}</span> plan
                  </>
                )}
              </p>
              
              {memberLimit !== Infinity && (
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
            </div>
          </div>
          
          {/* Warning when near/at limit */}
          {memberLimit !== Infinity && usage >= 90 && (
            <Alert variant={usage >= 100 ? 'destructive' : 'default'} className="mt-4">
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
        </Card>
      </div>

      {/* Pending Invites */}
      <div className="mb-8">
        <PendingInvitesList orgId={workspace.id} />
      </div>

      {/* Team Members List */}
      <TeamMembersList 
        orgId={workspace.id} 
        searchQuery={_resolvedSearchParams.search}
      />
    </div>
  )
}
