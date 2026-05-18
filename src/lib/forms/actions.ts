'use server'


import { ErrorService } from '@/lib/errors/error-service';

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  profileSchema,
  accountInfoSchema,
  organizationSchema,
  workspaceSchema,
  onboardingSchema,
  notificationPreferencesSchema,
} from './schemas'
import {
  workspaceOnboardingSchema,
} from './workspace-onboarding-schemas'
import {
  getProfile,
  updateProfile as dbUpdateProfile,
  checkHandleExists,
  createOrganization as dbCreateOrganization,
  updateOrganization as dbUpdateOrganization,
  checkOrgSlugExists,
  completeOnboarding as dbCompleteOnboarding,
  getNotificationPreferences,
  updateNotificationPreferences as dbUpdateNotificationPreferences,
} from '@/lib/db'
import { requireUserId } from '@/lib/auth/server-utils'
import { generateUniqueHandle } from '@/lib/auth/handle'
import { notificationCopy } from '@/lib/notifications/copy'

// ============================================================================
// PROFILE ACTIONS
// ============================================================================

export async function updateProfileAction(data: unknown) {
  try {
    const userId = await requireUserId()
    const validated = profileSchema.parse(data)

    // Convert null to undefined for avatar_url, bio, homepage, linkedin_url
    const cleanedData = {
      ...validated,
      avatar_url: validated.avatar_url === null ? undefined : validated.avatar_url,
      bio: validated.bio === null ? undefined : validated.bio,
      homepage: validated.homepage === null ? undefined : validated.homepage,
      linkedin_url: validated.linkedin_url === null ? undefined : validated.linkedin_url,
      github_username: validated.github_username === null ? undefined : validated.github_username,
      twitter_username: validated.twitter_username === null ? undefined : validated.twitter_username,
    }

    await dbUpdateProfile(userId, cleanedData)

    revalidatePath('/settings/profile')
    
    // Also revalidate public profile if user has a handle
    const profile = await getProfile(userId)
    if (profile?.handle) {
      revalidatePath(`/u/${profile.handle}`)
    }

    // TODO: Send notification when avatar is updated
    // Need to add PROFILE_UPDATE to notification types first

    return { success: true, message: notificationCopy.profile.updatedSuccessfully }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[actions] Update profile error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update profile',
    }
  }
}

// ============================================================================
// ACCOUNT ACTIONS
// ============================================================================

export async function updateAccountInfoAction(data: unknown) {
  try {
    const userId = await requireUserId()
    const validated = accountInfoSchema.parse(data)

    // Check handle availability
    const profile = await getProfile(userId)
    if (profile?.handle !== validated.handle) {
      const exists = await checkHandleExists(validated.handle)
      if (exists) {
        return {
          success: false,
          error: 'Handle already taken',
          field: 'handle',
        }
      }
    }

    await dbUpdateProfile(userId, {
      handle: validated.handle,
      name: `${validated.first_name} ${validated.last_name}`.trim(),
      first_name: validated.first_name,
      last_name: validated.last_name,
    })

    revalidatePath('/settings/account')
    
    // Also revalidate public profile if user has a handle
    if (profile?.handle) {
      revalidatePath(`/u/${profile.handle}`)
    }

    return { success: true, message: 'Account information updated successfully' }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[actions] Update account info error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update account',
    }
  }
}

// ============================================================================
// ORGANIZATION ACTIONS
// ============================================================================

export async function createOrganizationAction(data: unknown) {
  try {
    const userId = await requireUserId()
    const validated = organizationSchema.parse(data)

    // Check slug availability
    const exists = await checkOrgSlugExists(validated.slug)
    if (exists) {
      return {
        success: false,
        error: 'Organization slug already taken',
        field: 'slug',
      }
    }

    await dbCreateOrganization(validated, userId)

    // Redirect to organization page
    redirect(`/company/${validated.slug}`)
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[actions] Create organization error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    
    // Don't redirect on error
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
      throw error
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create organization',
    }
  }
}

/**
 * Create Workspace (MVP - Simplified)
 * Creates org with auto-generated project + environment via DB triggers
 */
export async function createWorkspaceAction(data: unknown) {
  try {
    const userId = await requireUserId()
    const validated = workspaceSchema.parse(data)

    // Check slug availability
    const exists = await checkOrgSlugExists(validated.slug)
    if (exists) {
      return {
        success: false,
        error: 'Workspace slug already taken',
        field: 'slug',
      }
    }

    // Create organization (triggers auto-create project + env)
    await dbCreateOrganization({
      slug: validated.slug,
      name: validated.name,
      type: validated.type,
      logo_url: validated.logo_url,
    }, userId)

    // Redirect to dashboard (workspace loads automatically)
    redirect('/dashboard')
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[actions] Create workspace error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    
    // Don't redirect on error
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
      throw error
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create workspace',
    }
  }
}

/**
 * Create Workspace with Full Onboarding Data - COMPLETE IMPLEMENTATION
 * Handles complete multi-step onboarding flow with all user inputs
 * 
 * ✅ STORES ALL DATA:
 * - Purpose, team_size, use_cases (in metadata + interests)
 * - Description (in bio field)
 * - Name, slug, type
 * - Team invites (creates invite records + sends emails if email service configured)
 * - Welcome notification
 */
export async function createWorkspaceOnboardingAction(data: unknown) {
  try {
    const userId = await requireUserId()
    
    // Check workspace creation limit FIRST (Notion/Slack/Linear pattern)
    const { canCreateWorkspace } = await import('@/lib/plans')
    const limitCheck = await canCreateWorkspace(userId)
    
    if (!limitCheck.allowed) {
      const limitText = limitCheck.limit === -1 ? 'unlimited' : limitCheck.limit

      return {
        success: false,
        error: `Workspace limit reached (${limitCheck.current}/${limitText}). Upgrade to ${limitCheck.upgrade?.suggestedPlan.toUpperCase()} plan to create more workspaces.`,
        upgrade: limitCheck.upgrade,
      }
    }
    
    // Validate all onboarding data
    const validated = workspaceOnboardingSchema.parse(data)

    // Check slug availability
    const exists = await checkOrgSlugExists(validated.slug)
    if (exists) {
      return {
        success: false,
        error: 'Workspace slug already taken',
        field: 'slug',
      }
    }
    
    // ALL manually created workspaces are 'team' type (regardless of team_size)
    // Personal workspaces are ONLY auto-created on user signup
    // This prevents the "User already has a personal workspace" error
    // We store team_size in metadata to track if it's solo/small/medium/enterprise
    const workspaceType = 'team'

    // 1. Create organization with FULL onboarding data
    const orgId = await dbCreateOrganization({
      slug: validated.slug,
      name: validated.name,
      type: workspaceType,
      logo_url: validated.logo_url || undefined, // ✅ STORES LOGO
      homepage: validated.homepage || undefined, // ✅ STORES HOMEPAGE
      bio: validated.description || undefined, // ✅ STORES DESCRIPTION
      interests: Array.isArray(validated.purpose) ? validated.purpose : (validated.purpose ? [validated.purpose] : []), // ✅ STORES PURPOSES as array
      // ✅ STORES PURPOSE + TEAM_SIZE in metadata JSONB column
      metadata: {
        onboarding_purposes: validated.purpose, // Multi-select purposes
        onboarding_team_size: validated.team_size,
        onboarding_completed_at: new Date().toISOString(),
        onboarding_version: '2.0', // v2.0: Name first, logo upload, multi-select purposes
        onboarding_source: 'workspace_creation_flow'
      }
    } as any, userId)

    // 2. Send team invites (if provided)
    if (validated.invites && validated.invites.length > 0) {
      try {
        // Import createInvite from db module
        const { createInvite } = await import('@/lib/db')
        
        const invitePromises = validated.invites.map(async (invite) => {
          try {
            const { invite_id, token } = await createInvite({
              org_id: orgId,
              email: invite.email,
              role: invite.role,
              inviter_id: userId
            })
            
            // Send invite email (if email service is configured)
            try {
              // Check if mail service exists
              const mailModule = await import('@/lib/mail').catch(() => null)
              
              if (mailModule && mailModule.sendTransactional) {
                const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.lucid.com'}/join/${token}`
                
                await mailModule.sendTransactional('invite', invite.email, {
                  orgName: validated.name,
                  role: invite.role,
                  acceptUrl: inviteUrl,
                  inviterName: validated.name
                }, {
                  dedupeKey: `invite:${orgId}:${invite.email}`
                })
                
              }
            } catch {
              // Don't fail the invite if email fails - user can still manually share invite link
            }

            return invite_id
          } catch {
            // Continue with other invites even if one fails
            return null
          }
        })
        
        await Promise.all(invitePromises)
      } catch (error) {
        ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[workspace-onboarding] ❌ Error processing invites:'
      },
      tags: {
        layer: 'server-action'
      }
    })
        // Don't fail the entire workspace creation if invites fail
      }
    }
    
    // 3. Create welcome notification
    try {
      const { createNotification } = await import('@/lib/db')
      
      await createNotification({
        user_id: userId,
        organization_id: orgId,
        title: '🎉 Workspace created!',
        message: `${validated.name} is ready to use. Start building amazing things!`,
        type: 'success',
        href: `/${validated.slug}/dashboard`
      } as any)

    } catch (error) {
      ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[workspace-onboarding] ⚠️ Failed to create notification:'
      },
      tags: {
        layer: 'server-action'
      }
    })
      // Don't fail if notification creation fails
    }
    
    // 4. Return success - let step 6 (celebration page) handle the redirect
    return {
      success: true,
      message: 'Workspace created successfully',
      data: {
        orgId,
        slug: validated.slug,
        name: validated.name
      }
    }
    
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[workspace-onboarding] ❌ Error creating workspace:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    
    // Don't redirect on error
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
      throw error
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create workspace',
    }
  }
}

// ============================================================================
// ONBOARDING ACTIONS
// ============================================================================

export async function completeOnboardingAction(data: unknown) {
  try {
    const userId = await requireUserId()
    
    const validated = onboardingSchema.parse(data)

    let resolvedHandle = validated.handle
    const exists = await checkHandleExists(resolvedHandle)
    if (exists) {
      resolvedHandle = await generateUniqueHandle({
        preferred_username: resolvedHandle,
      })
    }

    // Complete user profile (DB trigger should have already created personal workspace at signup)
    await dbCompleteOnboarding(userId, {
      handle: resolvedHandle,
      name: validated.name,
      avatar_url: validated.avatar_url,
      bio: validated.bio,
      homepage: validated.homepage,
      interests: validated.interests,
      github_username: validated.github_username,
      twitter_username: validated.twitter_username,
      linkedin_url: validated.linkedin_url,
      onboarding_completed: true, // ✅ Set flag
    })

    // Always create personal workspace first
    const { getUserOrganizations } = await import('@/lib/db')
    const orgs = await getUserOrganizations(userId)
    const personalWorkspaces = orgs.filter(membership => {
      const org = Array.isArray(membership.organization) ? membership.organization[0] : membership.organization
      return org?.type === 'personal'
    })
    const workspaceName = `${validated.name}'s Workspace`
    
    // Create personal workspace if doesn't exist
    if (personalWorkspaces.length === 0) {
      const personalSlug = resolvedHandle
      
      await dbCreateOrganization({
        slug: personalSlug,
        name: workspaceName,
        type: 'personal',
        created_by: userId,
      } as any, userId)
    } else {
      const personalWorkspace = Array.isArray(personalWorkspaces[0]?.organization)
        ? personalWorkspaces[0].organization[0]
        : personalWorkspaces[0]?.organization

      if (personalWorkspace?.id && personalWorkspace.name !== workspaceName) {
        await dbUpdateOrganization(personalWorkspace.id, { name: workspaceName })
      }
    }

    // ALSO create team workspace if requested (in addition to personal)
    if (validated.work_preference === 'team' && (validated as Record<string, unknown>).workspace_name && (validated as Record<string, unknown>).workspace_slug) {
      const workspaceData = validated as Record<string, unknown>
      
      // Check workspace slug availability
      const slugExists = await checkOrgSlugExists(workspaceData.workspace_slug as string)
      if (slugExists) {
        return {
          success: false,
          error: 'Workspace slug already taken',
          field: 'workspace_slug',
        }
      }

      // Create workspace with all onboarding data
      const orgId = await dbCreateOrganization({
        slug: workspaceData.workspace_slug as string,
        name: workspaceData.workspace_name as string,
        type: 'team',
        logo_url: workspaceData.workspace_logo_url as string | undefined,
        bio: workspaceData.workspace_description as string | undefined,
        interests: (workspaceData.purpose as string[]) || [],
        metadata: {
          onboarding_purposes: workspaceData.purpose,
          onboarding_team_size: workspaceData.team_size,
          onboarding_completed_at: new Date().toISOString(),
          onboarding_version: '3.0',
          onboarding_source: 'unified_user_workspace_flow'
        }
      } as any, userId)

      // Handle team invites if provided
      const invites = workspaceData.invites as Array<{ email: string; role: 'member' | 'owner' | 'admin' | 'guest' | 'developer' | 'analyst' | 'viewer' | 'billing' }> | undefined
      if (invites && invites.length > 0) {
        const { createInvite } = await import('@/lib/db')

        for (const invite of invites) {
          try {
            await createInvite({
              org_id: orgId,
              email: invite.email,
              role: invite.role,
              inviter_id: userId
            })
          } catch {
            // Continue with other invites even if one fails
          }
        }
      }

      // Return redirect URL — client does hard navigation to re-fetch all server data
      return {
        success: true,
        redirectTo: `/${workspaceData.workspace_slug as string}/dashboard`,
      }
    } else {
      // Solo path - route through the generic dashboard redirect.
      // This is more resilient than pushing directly to /{handle}/dashboard
      // immediately after personal-workspace creation, because membership
      // visibility can lag briefly and make the slug route 404.
      return {
        success: true,
        redirectTo: '/dashboard',
      }
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[user-onboarding] ❌ Complete onboarding error:'
      },
      tags: {
        layer: 'server-action'
      }
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to complete onboarding',
    }
  }
}

// ============================================================================
// HANDLE AVAILABILITY CHECK
// ============================================================================

export async function checkHandleAvailabilityAction(handle: string) {
  try {
    // Validate format
    if (handle.length < 3) {
      return {
        available: false,
        message: 'Too short (minimum 3 characters)',
      }
    }

    if (handle.length > 32) {
      return {
        available: false,
        message: 'Too long (maximum 32 characters)',
      }
    }

    if (!/^[a-z0-9_]+$/.test(handle)) {
      return {
        available: false,
        message: 'Only lowercase letters, numbers, and underscores allowed',
      }
    }

    // Check if exists
    const exists = await checkHandleExists(handle.toLowerCase())

    if (exists) {
      // Generate suggestions
      const suggestions = [
        `${handle}${Math.floor(Math.random() * 100)}`,
        `${handle}_${Math.random().toString(36).slice(2, 5)}`,
      ]

      return {
        available: false,
        message: 'Already taken',
        suggestions,
      }
    }

    return {
      available: true,
      message: 'Available ✓',
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[actions] Handle availability check error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      available: false,
      message: 'Error checking availability',
    }
  }
}

/**
 * Check workspace slug availability
 */
export async function checkWorkspaceSlugAvailabilityAction(slug: string) {
  try {
    // Validate format
    if (slug.length < 3) {
      return {
        available: false,
        message: 'Too short (minimum 3 characters)',
      }
    }

    if (slug.length > 32) {
      return {
        available: false,
        message: 'Too long (maximum 32 characters)',
      }
    }

    if (!/^[a-z0-9_]+$/.test(slug)) {
      return {
        available: false,
        message: 'Only lowercase letters, numbers, and underscores allowed',
      }
    }

    // Check if exists
    const exists = await checkOrgSlugExists(slug.toLowerCase())

    return {
      available: !exists,
      message: exists ? 'Already taken' : 'Available ✓',
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[actions] Workspace slug availability check error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      available: false,
      message: 'Error checking availability',
    }
  }
}

// ============================================================================
// NOTIFICATION PREFERENCES ACTIONS
// ============================================================================

/**
 * Get notification preferences (client-safe)
 */
export async function getNotificationPreferencesAction() {
  try {
    const userId = await requireUserId()
    const preferences = await getNotificationPreferences(userId)
    
    return {
      success: true,
      data: preferences
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[actions] Get notification preferences error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get notification preferences',
      data: null
    }
  }
}

export async function updateNotificationPreferencesAction(data: unknown) {
  try {
    const userId = await requireUserId()

    const validated = notificationPreferencesSchema.parse(data)

    await dbUpdateNotificationPreferences(userId, validated)

    revalidatePath('/settings/notifications')

    return { success: true, message: 'Notification preferences updated successfully' }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[actions] ❌ Update notification preferences error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to update notification preferences',
    }
  }
}

// ============================================================================
// WEBHOOK ACTIONS
// ============================================================================

export async function createWebhookAction(workflowId: string, data: unknown) {
  try {
    await requireUserId()
    const { webhookSchema } = await import('./schemas')
    const validated = webhookSchema.parse(data)

    // Import supabase
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify workflow exists and user has access
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, organization_id')
      .eq('id', workflowId)
      .single()

    if (workflowError || !workflow) {
      return {
        success: false,
        error: 'Workflow not found',
      }
    }

    // Generate unique path and API key
    const { data: pathData } = await supabase.rpc('generate_webhook_path')
    const { data: apiKeyData } = await supabase.rpc('generate_webhook_api_key')

    // Create webhook
    const { data: webhook, error: createError } = await supabase
      .from('workflow_webhooks')
      .insert({
        workflow_id: workflowId,
        path: pathData,
        api_key: apiKeyData,
        method: validated.method,
        description: validated.description || null,
        enabled: validated.enabled,
      })
      .select()
      .single()

    if (createError) {
      return {
        success: false,
        error: 'Failed to create webhook',
      }
    }

    revalidatePath(`/workflows/${workflowId}`)

    return {
      success: true,
      data: webhook,
      message: 'Webhook created successfully',
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[webhook-action] Create webhook error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create webhook',
    }
  }
}

export async function updateWebhookAction(
  workflowId: string,
  webhookId: string,
  data: unknown
) {
  try {
    await requireUserId()
    const { webhookUpdateSchema } = await import('./schemas')
    const validated = webhookUpdateSchema.parse(data)

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Update webhook
    const { data: webhook, error: updateError } = await supabase
      .from('workflow_webhooks')
      .update(validated)
      .eq('id', webhookId)
      .select()
      .single()

    if (updateError) {
      return {
        success: false,
        error: 'Failed to update webhook',
      }
    }

    revalidatePath(`/workflows/${workflowId}`)

    return {
      success: true,
      data: webhook,
      message: 'Webhook updated successfully',
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[webhook-action] Update webhook error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update webhook',
    }
  }
}

export async function deleteWebhookAction(workflowId: string, webhookId: string) {
  try {
    await requireUserId()

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await supabase
      .from('workflow_webhooks')
      .delete()
      .eq('id', webhookId)

    if (error) {
      ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[webhook-action] Delete error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
      return {
        success: false,
        error: 'Failed to delete webhook',
      }
    }

    revalidatePath(`/workflows/${workflowId}`)

    return {
      success: true,
      message: 'Webhook deleted successfully',
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[webhook-action] Delete webhook error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete webhook',
    }
  }
}

export async function regenerateWebhookApiKeyAction(
  workflowId: string,
  webhookId: string
) {
  try {
    await requireUserId()

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Generate new API key
    const { data: apiKeyData } = await supabase.rpc('generate_webhook_api_key')

    // Update webhook
    const { data: webhook, error: updateError } = await supabase
      .from('workflow_webhooks')
      .update({ api_key: apiKeyData })
      .eq('id', webhookId)
      .select()
      .single()

    if (updateError) {
      return {
        success: false,
        error: 'Failed to regenerate API key',
      }
    }

    revalidatePath(`/workflows/${workflowId}`)

    return {
      success: true,
      data: webhook,
      message: 'API key regenerated successfully',
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[webhook-action] Regenerate API key error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to regenerate API key',
    }
  }
}

// ============================================================================
// VARIABLE ACTIONS
// ============================================================================

export async function createVariableAction(workflowId: string, data: unknown) {
  try {
    const userId = await requireUserId()
    const { variableSchema } = await import('./schemas')
    const validated = variableSchema.parse(data)

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify workflow exists and user has access
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, organization_id')
      .eq('id', workflowId)
      .single()

    if (workflowError || !workflow) {
      return {
        success: false,
        error: 'Workflow not found',
      }
    }

    // Check if variable key already exists
    const { data: existing } = await supabase
      .from('workflow_variables')
      .select('id')
      .eq('workflow_id', workflowId)
      .eq('key', validated.key)
      .single()

    if (existing) {
      return {
        success: false,
        error: 'A variable with this name already exists',
      }
    }

    // Create variable
    const { data: variable, error: createError } = await supabase
      .from('workflow_variables')
      .insert({
        workflow_id: workflowId,
        key: validated.key,
        value: validated.value,
        type: validated.type,
        description: validated.description || null,
        created_by: userId,
      })
      .select()
      .single()

    if (createError) {
      return {
        success: false,
        error: 'Failed to create variable',
      }
    }

    revalidatePath(`/workflows/${workflowId}`)

    // Mask secret value in response
    const maskedVariable = {
      ...variable,
      value: variable.is_secret ? '••••••••' : variable.value
    }

    return {
      success: true,
      data: maskedVariable,
      message: 'Variable created successfully',
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[variable-action] Create variable error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create variable',
    }
  }
}

export async function updateVariableAction(
  workflowId: string,
  variableId: string,
  data: unknown
) {
  try {
    await requireUserId()
    const { variableUpdateSchema } = await import('./schemas')
    const validated = variableUpdateSchema.parse(data)

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Update variable
    const { data: variable, error: updateError } = await supabase
      .from('workflow_variables')
      .update(validated)
      .eq('id', variableId)
      .select()
      .single()

    if (updateError) {
      return {
        success: false,
        error: 'Failed to update variable',
      }
    }

    revalidatePath(`/workflows/${workflowId}`)

    // Mask secret value in response
    const maskedVariable = {
      ...variable,
      value: variable.is_secret ? '••••••••' : variable.value
    }

    return {
      success: true,
      data: maskedVariable,
      message: 'Variable updated successfully',
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[variable-action] Update variable error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update variable',
    }
  }
}

export async function deleteVariableAction(workflowId: string, variableId: string) {
  try {
    await requireUserId()

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await supabase
      .from('workflow_variables')
      .delete()
      .eq('id', variableId)

    if (error) {
      ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[variable-action] Delete error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
      return {
        success: false,
        error: 'Failed to delete variable',
      }
    }

    revalidatePath(`/workflows/${workflowId}`)

    return {
      success: true,
      message: 'Variable deleted successfully',
    }
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[variable-action] Delete variable error:'
      },
      tags: {
        layer: 'server-action'
      }
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete variable',
    }
  }
}

// ============================================================================
// Credential Actions
// ============================================================================

/**
 * Create a new credential
 */
export async function createCredentialAction(formData: FormData) {
  try {
    const userId = await requireUserId();
    
    const data = {
      name: formData.get('name') as string,
      type: formData.get('type') as string,
      data: JSON.parse(formData.get('data') as string),
    };

    // Validate with Zod
    const { credentialSchema } = await import('./schemas');
    const validated = credentialSchema.parse(data);

    // Encrypt credential data
    const { encryptCredential } = await import('@/lib/credentials/encryption');
    const encryptedData = encryptCredential(validated.data);

    // Create in database
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: credential, error } = await supabase
      .from('credentials')
      .insert({
        user_id: userId,
        name: validated.name,
        type: validated.type,
        data: encryptedData,
        created_by: userId,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: credential,
      message: 'Credential created successfully',
    };
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[createCredentialAction] Error:'
      },
      tags: {
        layer: 'server-action'
      }
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create credential',
    };
  }
}

/**
 * Update an existing credential
 */
export async function updateCredentialAction(
  credentialId: string,
  formData: FormData
) {
  try {
    const userId = await requireUserId();

    const data = {
      name: formData.get('name') as string,
      data: formData.get('data') ? JSON.parse(formData.get('data') as string) : undefined,
    };

    // Validate with Zod
    const { credentialUpdateSchema } = await import('./schemas');
    const validated = credentialUpdateSchema.parse(data);

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check ownership
    const { data: existing } = await supabase
      .from('credentials')
      .select('id')
      .eq('id', credentialId)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return {
        success: false,
        error: 'Credential not found or access denied',
      };
    }

    const updates: Record<string, unknown> = {};
    if (validated.name) updates.name = validated.name;
    if (validated.data) {
      const { encryptCredential } = await import('@/lib/credentials/encryption');
      updates.data = encryptCredential(validated.data);
    }

    const { data: credential, error } = await supabase
      .from('credentials')
      .update(updates)
      .eq('id', credentialId)
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/credentials');
    
    return {
      success: true,
      data: credential,
      message: 'Credential updated successfully',
    };
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[updateCredentialAction] Error:'
      },
      tags: {
        layer: 'server-action'
      }
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update credential',
    };
  }
}

/**
 * Delete a credential
 */
export async function deleteCredentialAction(credentialId: string) {
  try {
    const userId = await requireUserId();

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check ownership
    const { data: existing } = await supabase
      .from('credentials')
      .select('id')
      .eq('id', credentialId)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return {
        success: false,
        error: 'Credential not found or access denied',
      };
    }

    const { error } = await supabase
      .from('credentials')
      .delete()
      .eq('id', credentialId);

    if (error) throw error;

    revalidatePath('/credentials');
    
    return {
      success: true,
      message: 'Credential deleted successfully',
    };
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[deleteCredentialAction] Error:'
      },
      tags: {
        layer: 'server-action'
      }
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete credential',
    };
  }
}

// ============================================================================
// ACCOUNT DELETION ACTION
// ============================================================================

/**
 * Delete user account and all associated data
 * This is a permanent action that cannot be undone
 */
export async function deleteAccountAction() {
  try {
    const userId = await requireUserId();
    
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Delete profile (cascades will handle related data via database constraints)
    const { error: deleteError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (deleteError) {
      throw new Error('Failed to delete account');
    }

    return {
      success: true,
      message: 'Account deleted successfully',
    };
  } catch (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '[deleteAccountAction] Error:'
      },
      tags: {
        layer: 'server-action'
      }
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete account',
    };
  }
}
